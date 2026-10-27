from collections.abc import AsyncIterator

from dishka import BaseScope, Provider, Scope, provide
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.core.settings import DatabaseSettings
from backend.infrastructure.database.connection import (
    create_sa_engine,
    create_sa_session_factory,
)
from backend.infrastructure.database.transaction_manager import TransactionManager


class DatabaseProvider(Provider):
    def __init__(
        self,
        database_settings: DatabaseSettings,
        scope: BaseScope | None = None,
        component: str | None = None,
    ) -> None:
        super().__init__(scope, component)
        self._database_settings = database_settings

    @provide(scope=Scope.APP)
    def db_engine(self) -> AsyncEngine:
        return create_sa_engine(self._database_settings.url_obj)

    @provide(scope=Scope.APP)
    def db_session_factory(
        self, engine: AsyncEngine
    ) -> async_sessionmaker[AsyncSession]:
        return create_sa_session_factory(engine)

    @provide(scope=Scope.REQUEST)
    async def db_session(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    @provide(scope=Scope.REQUEST)
    def transaction_manager(self, session: AsyncSession) -> ITransactionManager:
        return TransactionManager(session)
