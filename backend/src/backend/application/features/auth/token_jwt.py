import logging
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

import jwt

from backend.application.exceptions.common import UnAuthorizedError
from backend.application.interfaces.services.token_jwt import (
    AccessTokenClaims,
    ITokenJWTService,
    RefreshTokenClaims,
    TokenClaims,
    TokenData,
    TokenPair,
)
from backend.core.settings import JWTSettings

log = logging.getLogger(__name__)

_TOKEN_TYPE_CLAIM = "token_type"
_REQUIRED_CLAIMS = ("exp", "iat", "sub", _TOKEN_TYPE_CLAIM)


class TokenJWTService(ITokenJWTService):
    def __init__(self, settings: JWTSettings) -> None:
        self._settings = settings

    def _encode_token(self, claims: TokenClaims, expire_minutes: int) -> str:
        now = datetime.now(UTC)
        payload: dict[str, Any] = {
            **claims,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=expire_minutes)).timestamp()),
        }
        return jwt.encode(
            payload,
            self._settings.private_key,
            algorithm=self._settings.algorithm,
        )

    def _create_access_token(self, user_id: UUID) -> str:
        claims: AccessTokenClaims = {"token_type": "access", "sub": str(user_id)}
        return self._encode_token(claims, self._settings.access_expiration_minutes)

    def _create_refresh_token(self, user_id: UUID) -> tuple[str, str]:
        refresh_jti = str(uuid4())
        claims: RefreshTokenClaims = {
            "token_type": "refresh",
            "sub": str(user_id),
            "jti": refresh_jti,
        }
        token = self._encode_token(claims, self._settings.refresh_expiration_minutes)
        return token, refresh_jti

    def create_token_pair(self, user_id: UUID) -> TokenPair:
        access_token = self._create_access_token(user_id)
        refresh_token, refresh_jti = self._create_refresh_token(user_id)
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            refresh_jti=refresh_jti,
        )

    def _decode_token(self, token: str) -> dict[str, Any]:
        try:
            return jwt.decode(
                token,
                self._settings.public_key,
                algorithms=[self._settings.algorithm],
                options={"require": list(_REQUIRED_CLAIMS)},
            )
        except jwt.ExpiredSignatureError:
            log.warning("Token expired")
            raise UnAuthorizedError("Token expired") from None
        except jwt.InvalidTokenError as e:
            log.warning("Invalid token: %s", e)
            raise UnAuthorizedError("Invalid token") from None

    def _verify_token(
        self, token: str, expected_type: Literal["access", "refresh"]
    ) -> dict[str, Any]:
        claims = self._decode_token(token)
        if claims[_TOKEN_TYPE_CLAIM] != expected_type:
            raise UnAuthorizedError(f"{expected_type.capitalize()} token required")
        return claims

    def verify_access_token(self, token: str) -> UUID:
        claims = self._verify_token(token, "access")
        return self._parse_user_id(self._require_str_claim(claims, "sub"))

    def verify_refresh_token(self, token: str) -> TokenData:
        claims = self._verify_token(token, "refresh")
        return TokenData(
            user_id=self._parse_user_id(self._require_str_claim(claims, "sub")),
            refresh_jti=self._require_str_claim(claims, "jti"),
        )

    def _require_str_claim(self, claims: Mapping[str, Any], name: str) -> str:
        value = claims.get(name)
        if not isinstance(value, str) or not value:
            log.warning("Invalid token payload: %s claim is missing or invalid", name)
            raise UnAuthorizedError("Invalid token payload")
        return value

    def _parse_user_id(self, sub: str) -> UUID:
        try:
            return UUID(sub)
        except ValueError:
            log.warning("Invalid token payload")
            raise UnAuthorizedError("Invalid token payload") from None
