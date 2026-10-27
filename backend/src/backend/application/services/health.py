from backend.application.interfaces.database.health import IDatabaseHealthChecker


class HealthCheckService:
    def __init__(
        self,
        db_checker: IDatabaseHealthChecker,
    ) -> None:
        self._db_checker = db_checker

    async def check(self) -> None:
        await self._db_checker.check()
