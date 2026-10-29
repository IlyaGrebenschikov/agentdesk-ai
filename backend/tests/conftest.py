from collections.abc import AsyncIterator

import pytest
from dishka import AsyncContainer, make_async_container
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from backend.core.ioc import get_ioc_providers
from backend.core.settings import (
    CorsSettings,
    DatabaseSettings,
    PwdHashSettings,
    ServerSettings,
    Settings,
)
from backend.infrastructure.database.connection import create_sa_session_factory
from backend.presentation.api import init_api
from tests.fakes import (
    FakeDatabaseHealthChecker,
    FakeDatabaseHealthCheckerProvider,
)


@pytest.fixture
def fake_db_checker() -> FakeDatabaseHealthChecker:
    return FakeDatabaseHealthChecker()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database=DatabaseSettings(
            _env_file=None,
            host="localhost",
            port=5432,
            username="test-user",
            password="test-password",
            database="test-db",
        ),
        server=ServerSettings(_env_file=None),
        cors=CorsSettings(_env_file=None, origins=["*"]),
        pwd_hash=PwdHashSettings(_env_file=None),
    )


@pytest.fixture
async def container(
    fake_db_checker: FakeDatabaseHealthChecker,
    settings: Settings,
) -> AsyncIterator[AsyncContainer]:
    container = make_async_container(
        *get_ioc_providers(settings),
        FakeDatabaseHealthCheckerProvider(fake_db_checker),
    )

    yield container

    await container.close()


@pytest.fixture
async def api_client(
    container: AsyncContainer,
    settings: Settings,
) -> AsyncIterator[AsyncClient]:
    app = init_api(settings, container)
    client = AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    )

    yield client

    await client.aclose()


@pytest.fixture
async def sqlite_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)"
            )
        )
    yield engine
    await engine.dispose()


@pytest.fixture
def sqlite_session_factory(
    sqlite_engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return create_sa_session_factory(sqlite_engine)


@pytest.fixture
async def sqlite_session(
    sqlite_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with sqlite_session_factory() as session:
        yield session
