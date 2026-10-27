from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status

from backend.application.services.health import HealthCheckService
from backend.presentation.api.docs import ServiceUnavailableErrorResponse
from backend.presentation.api.dto.health import HealthCheckResponse

health_router = APIRouter(prefix="/health", tags=["health"], route_class=DishkaRoute)


@health_router.get("/live", response_model=HealthCheckResponse)
async def check_liveness() -> HealthCheckResponse:
    return HealthCheckResponse()


@health_router.get(
    "/ready",
    response_model=HealthCheckResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ServiceUnavailableErrorResponse,
        },
    },
)
async def check_readiness(
    health_service: FromDishka[HealthCheckService],
) -> HealthCheckResponse:
    await health_service.check()
    return HealthCheckResponse()
