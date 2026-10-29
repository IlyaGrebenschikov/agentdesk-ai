from dishka import AsyncContainer
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI

from backend.core.settings import Settings
from .controllers import setup_controllers
from .handlers import setup_cors_middleware, setup_exception_handlers


def init_api(settings: Settings, di_container: AsyncContainer) -> FastAPI:
    app = FastAPI(title="AgentDesk API")
    setup_exception_handlers(app)
    setup_cors_middleware(app, settings.cors)
    setup_controllers(app)
    setup_dishka(di_container, app)
    return app
