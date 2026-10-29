from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status

from backend.application.features.users import (
    CreateUserCMD,
    CreateUserHandler,
    GetUserHandler,
    GetUserQuery,
)
from backend.presentation.api.docs import ConflictErrorResponse, NotFoundErrorResponse
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


@users_router.get(
    "/{user_id}",
    response_model=UserResponseDTO,
    responses={
        status.HTTP_404_NOT_FOUND: {
            "model": NotFoundErrorResponse,
        },
    },
)
async def get_user(
    user_id: UUID,
    handler: FromDishka[GetUserHandler],
) -> UserResponseDTO:
    user = await handler.execute(GetUserQuery(user_id=user_id))
    return UserResponseDTO.model_validate(user)
