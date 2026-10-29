from uuid import UUID

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.application.interfaces.database.repositories import (
    IUsersRepository,
    TCreateUser,
)
from backend.domain import User
from backend.infrastructure.database.models import UserModel
from .base import BaseRepository


class UsersMapper:
    @staticmethod
    def model_to_domain(model: UserModel) -> User:
        return User(id=model.id, email=model.email, password_hash=model.password_hash)


class UsersRepository(BaseRepository, IUsersRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def create_user(self, user: TCreateUser) -> User:
        stmt = insert(UserModel).values(**user).returning(UserModel)
        result = await self._session.execute(stmt)
        return UsersMapper.model_to_domain(result.scalar_one())

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return UsersMapper.model_to_domain(model)

    async def get_user_by_email(self, email: str) -> User | None:
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return UsersMapper.model_to_domain(model)
