from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status

from backend.application.features.users import CreateUserCMD, CreateUserHandler
from backend.presentation.api.docs import ConflictErrorResponse
from backend.presentation.api.dto.user import CreateUserDTO, UserResponseDTO

users_router = APIRouter(prefix="/users", tags=["users"], route_class=DishkaRoute)


@users_router.post(
    "",
    response_model=UserResponseDTO,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_409_CONFLICT: {
            "model": ConflictErrorResponse,
        },
    },
)
async def create_user(
    dto: CreateUserDTO,
    handler: FromDishka[CreateUserHandler],
) -> UserResponseDTO:
    user = await handler.execute(
        CreateUserCMD(email=str(dto.email), password=dto.password)
    )
    return UserResponseDTO.model_validate(user)
