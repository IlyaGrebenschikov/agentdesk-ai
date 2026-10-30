from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from dishka import AsyncContainer
from pydantic import ValidationError

from backend.application.exceptions import UnAuthorizedError
from backend.application.features.auth import TokenJWTService
from backend.application.interfaces.services.token_jwt import ITokenJWTService
from backend.core.settings import JWTSettings


def _write_key_pair(directory: Path) -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    (directory / "jwt-private.pem").write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (directory / "jwt-public.pem").write_bytes(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


@pytest.fixture
def jwt_settings(tmp_path: Path) -> JWTSettings:
    _write_key_pair(tmp_path)
    return JWTSettings(_env_file=None, certs_dir=tmp_path)


@pytest.fixture
def token_service(jwt_settings: JWTSettings) -> TokenJWTService:
    return TokenJWTService(jwt_settings)


def test_access_token_round_trip(token_service: TokenJWTService) -> None:
    user_id = uuid4()

    pair = token_service.create_token_pair(user_id)

    assert token_service.verify_access_token(pair.access_token) == user_id


def test_refresh_token_round_trip(token_service: TokenJWTService) -> None:
    user_id = uuid4()

    pair = token_service.create_token_pair(user_id)
    data = token_service.verify_refresh_token(pair.refresh_token)

    assert data.user_id == user_id
    assert data.refresh_jti == pair.refresh_jti
    assert UUID(data.refresh_jti)


def test_create_token_pair_generates_new_refresh_jti(
    token_service: TokenJWTService,
) -> None:
    user_id = uuid4()

    first = token_service.create_token_pair(user_id)
    second = token_service.create_token_pair(user_id)

    assert first.refresh_jti != second.refresh_jti
    assert first.refresh_token != second.refresh_token


def test_access_token_is_rejected_as_refresh_token(
    token_service: TokenJWTService,
) -> None:
    pair = token_service.create_token_pair(uuid4())

    with pytest.raises(UnAuthorizedError, match="Refresh token required"):
        token_service.verify_refresh_token(pair.access_token)


def test_refresh_token_is_rejected_as_access_token(
    token_service: TokenJWTService,
) -> None:
    pair = token_service.create_token_pair(uuid4())

    with pytest.raises(UnAuthorizedError, match="Access token required"):
        token_service.verify_access_token(pair.refresh_token)


def test_expired_token_is_rejected(
    token_service: TokenJWTService,
    jwt_settings: JWTSettings,
) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "token_type": "access",
            "sub": str(uuid4()),
            "iat": int((now - timedelta(minutes=2)).timestamp()),
            "exp": int((now - timedelta(minutes=1)).timestamp()),
        },
        jwt_settings.private_key,
        algorithm=jwt_settings.algorithm,
    )

    with pytest.raises(UnAuthorizedError, match="Token expired"):
        token_service.verify_access_token(token)


def test_malformed_token_is_rejected(token_service: TokenJWTService) -> None:
    with pytest.raises(UnAuthorizedError, match="Invalid token"):
        token_service.verify_access_token("not-a-token")


def test_token_without_required_claim_is_rejected(
    token_service: TokenJWTService,
    jwt_settings: JWTSettings,
) -> None:
    token = jwt.encode(
        {
            "token_type": "access",
            "sub": str(uuid4()),
            "iat": int(datetime.now(UTC).timestamp()),
        },
        jwt_settings.private_key,
        algorithm=jwt_settings.algorithm,
    )

    with pytest.raises(UnAuthorizedError, match="Invalid token"):
        token_service.verify_access_token(token)


def test_token_with_invalid_subject_is_rejected(
    token_service: TokenJWTService,
    jwt_settings: JWTSettings,
) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "token_type": "access",
            "sub": "not-a-uuid",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        jwt_settings.private_key,
        algorithm=jwt_settings.algorithm,
    )

    with pytest.raises(UnAuthorizedError, match="Invalid token payload"):
        token_service.verify_access_token(token)


def test_refresh_token_without_jti_is_rejected(
    token_service: TokenJWTService,
    jwt_settings: JWTSettings,
) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "token_type": "refresh",
            "sub": str(uuid4()),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        jwt_settings.private_key,
        algorithm=jwt_settings.algorithm,
    )

    with pytest.raises(UnAuthorizedError, match="Invalid token payload"):
        token_service.verify_refresh_token(token)


def test_missing_key_file_raises(tmp_path: Path) -> None:
    settings = JWTSettings(_env_file=None, certs_dir=tmp_path)

    with pytest.raises(FileNotFoundError, match="JWT key file not found"):
        _ = settings.private_key


def test_refresh_lifetime_cannot_be_shorter_than_access_lifetime() -> None:
    with pytest.raises(ValidationError):
        JWTSettings(
            _env_file=None,
            access_expiration_minutes=60,
            refresh_expiration_minutes=30,
        )


async def test_token_service_is_registered_in_container(
    container: AsyncContainer,
) -> None:
    service = await container.get(ITokenJWTService)

    assert isinstance(service, TokenJWTService)
