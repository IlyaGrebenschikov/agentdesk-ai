from dataclasses import dataclass
from uuid import UUID

from backend.application.exceptions import UnAuthorizedError
from backend.application.interfaces.cache.repositories import (
    IRefreshTokenRepository,
)


@dataclass(frozen=True, slots=True)
class LogoutCommand:
    user_id: UUID
    jti: str


class LogoutHandler:
    def __init__(self, refresh_token_repository: IRefreshTokenRepository) -> None:
        self._refresh_token_repository = refresh_token_repository

    async def execute(self, cmd: LogoutCommand) -> None:
        if not await self._refresh_token_repository.revoke(cmd.user_id, cmd.jti):
            raise UnAuthorizedError("Refresh token not found")
