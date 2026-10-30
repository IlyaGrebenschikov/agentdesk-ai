import asyncio

from dishka import Provider, Scope, provide

from backend.application.features.auth import TokenJWTService
from backend.application.features.users import CreateUserHandler, GetUserHandler
from backend.application.interfaces.database.health import IDatabaseHealthChecker
from backend.application.interfaces.database.repositories import IUsersRepository
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)
from backend.application.interfaces.pwd_hasher import IPwdHasher
from backend.application.interfaces.token_jwt import ITokenJWTService
from backend.application.limiters import PwdHashLimiter
from backend.application.services.health import HealthCheckService
from backend.core.settings import JWTSettings, PwdHashSettings


class UserFeaturesProvider(Provider):
    def __init__(self, settings: PwdHashSettings) -> None:
        super().__init__()
        self._settings = settings

    @provide(scope=Scope.APP)
    def pwd_hash_limiter(self) -> PwdHashLimiter:
        return PwdHashLimiter(asyncio.Semaphore(self._settings.max_threads))

    @provide(scope=Scope.REQUEST)
    def create_user_handler(
        self,
        transaction_manager: ITransactionManager,
        users_repository: IUsersRepository,
        pwd_hasher: IPwdHasher,
        pwd_hash_limiter: PwdHashLimiter,
    ) -> CreateUserHandler:
        return CreateUserHandler(
            transaction_manager,
            users_repository,
            pwd_hasher,
            pwd_hash_limiter,
        )

    @provide(scope=Scope.REQUEST)
    def get_user_handler(
        self,
        users_repository: IUsersRepository,
    ) -> GetUserHandler:
        return GetUserHandler(users_repository)


class HealthCheckProvider(Provider):
    @provide(scope=Scope.REQUEST)
    def health_check_service(
        self,
        db_checker: IDatabaseHealthChecker,
    ) -> HealthCheckService:
        return HealthCheckService(db_checker)


class AuthFeaturesProvider(Provider):
    def __init__(self, settings: JWTSettings) -> None:
        super().__init__()
        self._settings = settings

    @provide(scope=Scope.APP)
    def token_jwt_service(self) -> ITokenJWTService:
        return TokenJWTService(self._settings)
