import asyncio
import logging
from dataclasses import dataclass, field

from backend.application.exceptions import UnAuthorizedError
from backend.application.interfaces.cache.repositories import (
    IRefreshTokenRepository,
)
from backend.application.interfaces.database.repositories import (
    IUsersRepository,
)
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.application.interfaces.pwd_hasher import IPwdHasher
from backend.application.interfaces.services.token_jwt import (
    ITokenJWTService,
    TokenPair,
)
from backend.application.limiters import PwdHashLimiter

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LoginCommand:
    email: str
    password: str = field(repr=False)


class LoginHandler:
    def __init__(
        self,
        users_repository: IUsersRepository,
        pwd_hasher: IPwdHasher,
        pwd_hash_limiter: PwdHashLimiter,
        token_service: ITokenJWTService,
        refresh_token_repository: IRefreshTokenRepository,
        transaction_manager: ITransactionManager,
    ) -> None:
        self._users_repository = users_repository
        self._pwd_hasher = pwd_hasher
        self._pwd_hash_limiter = pwd_hash_limiter
        self._token_service = token_service
        self._refresh_token_repository = refresh_token_repository
        self._transaction_manager = transaction_manager

    async def execute(self, cmd: LoginCommand) -> TokenPair:
        email = cmd.email.lower()

        async with self._transaction_manager:
            user = await self._users_repository.get_user_by_email(email)
            if user is None:
                log.warning("Login rejected: user not found")
                raise UnAuthorizedError("Incorrect login or password")

            # Argon2 is CPU-bound: run it in a thread and cap concurrent hashes.
            async with self._pwd_hash_limiter:
                password_matches = await asyncio.to_thread(
                    self._pwd_hasher.verify_password,
                    cmd.password,
                    user.password_hash,
                )

            if not password_matches:
                log.warning("Login rejected: invalid password")
                raise UnAuthorizedError("Incorrect login or password")

            user_id = user.id

        pair = self._token_service.create_token_pair(user_id)
        await self._refresh_token_repository.save(user_id, pair.refresh_jti)
        return pair
