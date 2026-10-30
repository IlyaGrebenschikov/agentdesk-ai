from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status

from backend.application.features.auth import (
    LoginCommand,
    LoginHandler,
    LogoutCommand,
    LogoutHandler,
    RefreshCommand,
    RefreshHandler,
)
from backend.presentation.api.dependencies import RefreshTokenData
from backend.presentation.api.docs import UnAuthorizedErrorResponse
from backend.presentation.api.dto.auth import (
    LoginEmailDTO,
    LogoutResponseDTO,
    TokenResponseDTO,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"], route_class=DishkaRoute)


@auth_router.post(
    "/login/email",
    response_model=TokenResponseDTO,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": UnAuthorizedErrorResponse},
    },
)
async def login_email(
    data: LoginEmailDTO,
    handler: FromDishka[LoginHandler],
) -> TokenResponseDTO:
    pair = await handler.execute(
        LoginCommand(email=str(data.email), password=data.password)
    )
    return TokenResponseDTO(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
    )


@auth_router.post(
    "/refresh",
    response_model=TokenResponseDTO,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": UnAuthorizedErrorResponse},
    },
)
async def refresh(
    token_data: RefreshTokenData,
    handler: FromDishka[RefreshHandler],
) -> TokenResponseDTO:
    pair = await handler.execute(
        RefreshCommand(user_id=token_data.user_id, jti=token_data.refresh_jti)
    )
    return TokenResponseDTO(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
    )


@auth_router.post(
    "/logout",
    response_model=LogoutResponseDTO,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": UnAuthorizedErrorResponse},
    },
)
async def logout(
    token_data: RefreshTokenData,
    handler: FromDishka[LogoutHandler],
) -> LogoutResponseDTO:
    await handler.execute(
        LogoutCommand(user_id=token_data.user_id, jti=token_data.refresh_jti)
    )
    return LogoutResponseDTO()
