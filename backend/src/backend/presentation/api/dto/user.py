from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from .base import BaseDTO, BaseResponseDTO


class UserResponseDTO(BaseResponseDTO):
    id: UUID
    email: EmailStr


class CreateUserDTO(BaseDTO):
    email: EmailStr = Field(max_length=250)
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least one letter")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one digit")
        return value
