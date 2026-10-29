from collections.abc import AsyncIterator

from dishka import Provider, Scope, provide
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.application.interfaces.database.health import IDatabaseHealthChecker


class FakeDatabaseHealthChecker:
    def __init__(self) -> None:
        self.calls = 0
        self.error: Exception | None = None

    async def check(self) -> None:
        self.calls += 1
        if self.error is not None:
            raise self.error


class FakeDatabaseHealthCheckerProvider(Provider):
    def __init__(self, checker: FakeDatabaseHealthChecker) -> None:
        super().__init__()
        self._checker = checker

    @provide(scope=Scope.REQUEST, override=True)
    def database_health_checker(self) -> IDatabaseHealthChecker:
        return self._checker


class SqliteSessionProvider(Provider):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        super().__init__()
        self._session_factory = session_factory

    @provide(scope=Scope.REQUEST, override=True)
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._session_factory() as session:
            yield session
