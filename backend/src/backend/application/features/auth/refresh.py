import logging
from dataclasses import dataclass
from uuid import UUID

from backend.application.exceptions import NotFoundError, UnAuthorizedError
from backend.application.interfaces.cache.repositories import (
    IRefreshTokenRepository,
)
from backend.application.interfaces.database.repositories import (
    IUsersRepository,
)
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.application.interfaces.services.token_jwt import (
    ITokenJWTService,
    TokenPair,
)

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RefreshCommand:
    user_id: UUID
    jti: str


class RefreshHandler:
    def __init__(
        self,
        users_repository: IUsersRepository,
        refresh_token_repository: IRefreshTokenRepository,
        token_service: ITokenJWTService,
        transaction_manager: ITransactionManager,
    ) -> None:
        self._users_repository = users_repository
        self._refresh_token_repository = refresh_token_repository
        self._token_service = token_service
        self._transaction_manager = transaction_manager

    async def execute(self, cmd: RefreshCommand) -> TokenPair:
        async with self._transaction_manager:
            user = await self._users_repository.get_user_by_id(cmd.user_id)
            if user is None:
                log.warning(
                    "Refresh rejected: user not found with id '%s'", cmd.user_id
                )
                raise NotFoundError("User not found")

        if not await self._refresh_token_repository.revoke(cmd.user_id, cmd.jti):
            log.warning("Refresh rejected: token is invalid or already revoked")
            raise UnAuthorizedError("Refresh token is invalid or already revoked")

        pair = self._token_service.create_token_pair(user.id)
        await self._refresh_token_repository.save(user.id, pair.refresh_jti)
        return pair
