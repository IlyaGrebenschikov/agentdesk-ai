import asyncio
import logging
from dataclasses import dataclass, field

from dishka.integrations.fastapi import FromDishka

from backend.application.exceptions import ConflictError
from backend.application.interfaces.database.repositories.users import (
    IUsersRepository,
    TCreateUser,
)
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.application.interfaces.pwd_hasher import IPwdHasher
from backend.application.limiters import PwdHashLimiter
from backend.domain import User

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CreateUserCMD:
    email: str
    password: str = field(repr=False)


class CreateUserHandler:
    def __init__(
        self,
        transaction_manager: FromDishka[ITransactionManager],
        users_repository: FromDishka[IUsersRepository],
        pwd_hasher: FromDishka[IPwdHasher],
        pwd_hash_limiter: FromDishka[PwdHashLimiter],
    ) -> None:
        self._transaction_manager = transaction_manager
        self._users_repository = users_repository
        self._pwd_hasher = pwd_hasher
        self._pwd_hash_limiter = pwd_hash_limiter

    async def execute(self, cmd: CreateUserCMD) -> User:
        async with self._transaction_manager:
            if await self._users_repository.get_user_by_email(cmd.email):
                log.warning("User already exists: email=%s", cmd.email)
                raise ConflictError("User with this email already exists")

            # Argon2 is CPU-bound: run it in a thread and cap concurrent hashes.
            async with self._pwd_hash_limiter:
                password_hash = await asyncio.to_thread(
                    self._pwd_hasher.hash_password, cmd.password
                )

            user = await self._users_repository.create_user(
                TCreateUser(email=cmd.email, password_hash=password_hash)
            )

        log.info("User created: id=%s", user.id)
        return user
