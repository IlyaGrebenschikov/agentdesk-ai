import logging

from dishka import AsyncContainer, make_async_container

from backend.infrastructure.dependencies import (
    DatabaseProvider,
)

from .settings import Settings

log = logging.getLogger(__name__)


def setup_ioc(settings: Settings) -> AsyncContainer:
    log.info("Setting up IOC")
    providers = (DatabaseProvider(settings.database),)
    container = make_async_container(*providers)
    return container
