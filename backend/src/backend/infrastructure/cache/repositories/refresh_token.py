from datetime import timedelta
from uuid import UUID

from redis.asyncio import Redis

from backend.application.interfaces.cache.repositories import IRefreshTokenRepository


class RefreshTokenRepository(IRefreshTokenRepository):
    def __init__(self, client: Redis, refresh_expiration: timedelta) -> None:
        self._redis = client
        self._refresh_expiration = refresh_expiration

    def _key(self, user_id: UUID, jti: str) -> str:
        return f"refresh:{user_id}:{jti}"

    async def save(self, user_id: UUID, jti: str) -> None:
        await self._redis.set(
            self._key(user_id, jti),
            "1",
            ex=self._refresh_expiration,
        )

    async def revoke(self, user_id: UUID, jti: str) -> bool:
        return bool(await self._redis.delete(self._key(user_id, jti)))
