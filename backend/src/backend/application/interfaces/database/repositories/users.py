from typing import Protocol, TypedDict
from uuid import UUID

from backend.domain import User


class TCreateUser(TypedDict):
    email: str
    password_hash: str


class IUsersRepository(Protocol):
    async def create_user(self, user: TCreateUser) -> User: ...

    async def get_user_by_id(self, user_id: UUID) -> User | None: ...

    async def get_user_by_email(self, email: str) -> User | None: ...
