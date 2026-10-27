from dishka import Provider, Scope, provide

from backend.application.interfaces.database.health import IDatabaseHealthChecker
from backend.application.services.health import HealthCheckService


class HealthCheckProvider(Provider):
    @provide(scope=Scope.REQUEST)
    def health_check_service(
        self,
        db_checker: IDatabaseHealthChecker,
    ) -> HealthCheckService:
        return HealthCheckService(db_checker)
