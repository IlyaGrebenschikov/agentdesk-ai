import logging

from dishka import AsyncContainer, make_async_container
from dishka.provider import BaseProvider

from backend.application.dependencies import HealthCheckProvider, UserFeaturesProvider
from backend.infrastructure.dependencies import (
    DatabaseProvider,
    HealthCheckersProvider,
    PwdHasherProvider,
    RepositoriesProvider,
)
from .settings import Settings

log = logging.getLogger(__name__)


def get_ioc_providers(settings: Settings) -> tuple[BaseProvider, ...]:
    return (
        DatabaseProvider(settings.database),
        RepositoriesProvider(),
        HealthCheckersProvider(settings.database.health_check_timeout),
        HealthCheckProvider(),
        UserFeaturesProvider(settings.pwd_hash),
        PwdHasherProvider(),
    )


def setup_ioc(settings: Settings) -> AsyncContainer:
    log.info("Setting up IOC")
    return make_async_container(*get_ioc_providers(settings))
