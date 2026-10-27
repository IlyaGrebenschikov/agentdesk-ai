import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.application.exceptions import ServiceUnavailableError
from backend.application.interfaces.database.health import IDatabaseHealthChecker

log = logging.getLogger(__name__)


class DatabaseHealthChecker(IDatabaseHealthChecker):
    def __init__(self, session: AsyncSession, timeout: float) -> None:
        self._session = session
        self._timeout = timeout

    async def check(self) -> None:
        try:
            async with asyncio.timeout(self._timeout):
                await self._session.execute(text("SELECT 1"))
        except TimeoutError as err:
            log.warning(
                "Database health check timed out after %.1f seconds",
                self._timeout,
            )
            raise ServiceUnavailableError("Database health check timed out") from err
        except (SQLAlchemyError, OSError) as err:
            log.warning("Database health check failed: %s", err)
            raise ServiceUnavailableError("Database is unavailable") from err
