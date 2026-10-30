from typing import Literal

from pydantic import EmailStr, Field

from .base import BaseDTO, BaseResponseDTO


class LoginEmailDTO(BaseDTO):
    email: EmailStr = Field(max_length=250)
    password: str = Field(repr=False)


class TokenResponseDTO(BaseResponseDTO):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class LogoutResponseDTO(BaseResponseDTO):
    message: str = "Logged out"
