from dishka import Provider, Scope, provide

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
