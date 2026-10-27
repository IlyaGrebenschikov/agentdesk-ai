import logging

from dishka import AsyncContainer, make_async_container

from backend.infrastructure.dependencies import DatabaseProvider, HealthCheckersProvider

from .settings import Settings

log = logging.getLogger(__name__)


def setup_ioc(settings: Settings) -> AsyncContainer:
    log.info("Setting up IOC")
    providers = (
        DatabaseProvider(settings.database),
        HealthCheckersProvider(settings.database.health_check_timeout),
    )
    container = make_async_container(*providers)
    return container
