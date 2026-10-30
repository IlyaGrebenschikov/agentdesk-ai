from collections.abc import AsyncIterator
from datetime import timedelta

from dishka import BaseScope, Provider, Scope, provide
from pwdlib import PasswordHash
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from backend.application.interfaces.cache.repositories import IRefreshTokenRepository
from backend.application.interfaces.database.health import IDatabaseHealthChecker
from backend.application.interfaces.database.repositories import IUsersRepository
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.application.interfaces.pwd_hasher import IPwdHasher
from backend.core.settings import CacheSettings, DatabaseSettings
from backend.infrastructure.cache.connection import create_client
from backend.infrastructure.cache.repositories import RefreshTokenRepository
from backend.infrastructure.database.connection import (
    create_sa_engine,
    create_sa_session_factory,
)
from backend.infrastructure.database.health import DatabaseHealthChecker
from backend.infrastructure.database.repositories import UsersRepository
from backend.infrastructure.database.transaction_manager import TransactionManager
from .pwd_hasher import Argon2PwdHasher


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

    @provide(scope=Scope.REQUEST)
    def users_repository(self, session: AsyncSession) -> IUsersRepository:
        return UsersRepository(session)


class CacheProvider(Provider):
    def __init__(
        self,
        cache_settings: CacheSettings,
        refresh_expiration: timedelta,
        scope: BaseScope | None = None,
        component: str | None = None,
    ) -> None:
        super().__init__(scope, component)
        self._cache_settings = cache_settings
        self._refresh_expiration = refresh_expiration

    @provide(scope=Scope.APP)
    async def redis_client(self) -> AsyncIterator[Redis]:
        client = create_client(self._cache_settings.url)
        try:
            yield client
        finally:
            await client.aclose()

    @provide(scope=Scope.REQUEST)
    def refresh_token_repository(self, client: Redis) -> IRefreshTokenRepository:
        return RefreshTokenRepository(client, self._refresh_expiration)


class HealthCheckersProvider(Provider):
    def __init__(
        self,
        database_timeout: float,
        scope: BaseScope | None = None,
        component: str | None = None,
    ) -> None:
        super().__init__(scope, component)
        self._database_timeout = database_timeout

    @provide(scope=Scope.REQUEST)
    def database_health_checker(self, session: AsyncSession) -> IDatabaseHealthChecker:
        return DatabaseHealthChecker(session, self._database_timeout)


class PwdHasherProvider(Provider):
    @provide(scope=Scope.APP)
    def get_password_hash(self) -> PasswordHash:
        return PasswordHash.recommended()

    @provide(scope=Scope.APP)
    def argon2_hasher(self, hasher: PasswordHash) -> IPwdHasher:
        return Argon2PwdHasher(hasher)
