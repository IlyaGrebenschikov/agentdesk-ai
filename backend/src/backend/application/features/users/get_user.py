from dataclasses import dataclass
from uuid import UUID

from dishka.integrations.fastapi import FromDishka

from backend.application.exceptions import NotFoundError
from backend.application.interfaces.database.repositories.users import IUsersRepository
from backend.domain import User


@dataclass(frozen=True, slots=True)
class GetUserQuery:
    user_id: UUID


class GetUserHandler:
    def __init__(
        self,
        users_repository: FromDishka[IUsersRepository],
    ) -> None:
        self._users_repository = users_repository

    async def execute(self, query: GetUserQuery) -> User:
        user = await self._users_repository.get_user_by_id(query.user_id)
        if user is None:
            raise NotFoundError("User not found")
        return user
