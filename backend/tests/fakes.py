from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from dishka import Provider, Scope, provide
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.application.interfaces.cache.repositories import (
    IRefreshTokenRepository,
)
from backend.application.interfaces.database.health import IDatabaseHealthChecker


def write_jwt_key_pair(directory: Path) -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    (directory / "jwt-private.pem").write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (directory / "jwt-public.pem").write_bytes(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


class FakeDatabaseHealthChecker:
    def __init__(self) -> None:
        self.calls = 0
        self.error: Exception | None = None

    async def check(self) -> None:
        self.calls += 1
        if self.error is not None:
            raise self.error


class FakeRefreshTokenRepository:
    def __init__(self) -> None:
        self._tokens: set[tuple[UUID, str]] = set()

    @property
    def token_count(self) -> int:
        return len(self._tokens)

    async def save(self, user_id: UUID, jti: str) -> None:
        self._tokens.add((user_id, jti))

    async def revoke(self, user_id: UUID, jti: str) -> bool:
        key = (user_id, jti)
        if key not in self._tokens:
            return False
        self._tokens.remove(key)
        return True


class FakeRefreshTokenRepositoryProvider(Provider):
    def __init__(self, repository: FakeRefreshTokenRepository) -> None:
        super().__init__()
        self._repository = repository

    @provide(scope=Scope.REQUEST, override=True)
    def refresh_token_repository(self) -> IRefreshTokenRepository:
        return self._repository


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
