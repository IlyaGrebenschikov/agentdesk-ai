from fastapi import APIRouter, FastAPI

from .health import health_router


def setup_controllers(app: FastAPI) -> None:
    v1_router = APIRouter(prefix="/api/v1")
    v1_router.include_router(health_router)
    app.include_router(v1_router)


__all__ = ("setup_controllers",)
