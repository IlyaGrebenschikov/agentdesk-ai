import logging
from datetime import timedelta

from dishka import AsyncContainer, make_async_container
from dishka.provider import BaseProvider

from backend.application.dependencies import (
    AuthFeaturesProvider,
    HealthCheckProvider,
    UserFeaturesProvider,
)
from backend.infrastructure.dependencies import (
    CacheProvider,
    DatabaseProvider,
    HealthCheckersProvider,
    PwdHasherProvider,
)
from .settings import Settings

log = logging.getLogger(__name__)


def get_ioc_providers(settings: Settings) -> tuple[BaseProvider, ...]:
    return (
        DatabaseProvider(settings.database),
        HealthCheckersProvider(settings.database.health_check_timeout),
        HealthCheckProvider(),
        UserFeaturesProvider(settings.pwd_hash),
        PwdHasherProvider(),
        AuthFeaturesProvider(settings.jwt),
        CacheProvider(
            settings.cache,
            timedelta(minutes=settings.jwt.refresh_expiration_minutes),
        ),
    )


def setup_ioc(settings: Settings) -> AsyncContainer:
    log.info("Setting up IOC")
    return make_async_container(*get_ioc_providers(settings))
