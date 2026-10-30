from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.application.exceptions import UnAuthorizedError
from backend.application.interfaces.services.token_jwt import (
    ITokenJWTService,
    TokenData,
)

access_token_bearer_scheme = HTTPBearer(auto_error=False, scheme_name="Access token")
refresh_token_bearer_scheme = HTTPBearer(auto_error=False, scheme_name="Refresh token")

AccessTokenCredentials = Annotated[
    HTTPAuthorizationCredentials | None,
    Security(access_token_bearer_scheme),
]
RefreshTokenCredentials = Annotated[
    HTTPAuthorizationCredentials | None,
    Security(refresh_token_bearer_scheme),
]


def _extract_token(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None:
        raise UnAuthorizedError("Missing bearer token")
    return credentials.credentials


@inject
def get_current_user_id_from_access_token(
    token_service: FromDishka[ITokenJWTService],
    credentials: AccessTokenCredentials,
) -> UUID:
    return token_service.verify_access_token(_extract_token(credentials))


@inject
def get_refresh_token_data(
    token_service: FromDishka[ITokenJWTService],
    credentials: RefreshTokenCredentials,
) -> TokenData:
    return token_service.verify_refresh_token(_extract_token(credentials))


CurrentUserId = Annotated[UUID, Depends(get_current_user_id_from_access_token)]
RefreshTokenData = Annotated[TokenData, Depends(get_refresh_token_data)]
