from fastapi import APIRouter, FastAPI

from .health import health_router
from .users import users_router


def setup_controllers(app: FastAPI) -> None:
    v1_router = APIRouter(prefix="/api/v1")
    v1_router.include_router(health_router)
    v1_router.include_router(users_router)
    app.include_router(v1_router)


__all__ = ("setup_controllers",)
