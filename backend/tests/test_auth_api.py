import pytest
from httpx import AsyncClient

from tests.fakes import FakeRefreshTokenRepository

AUTH_URL = "/api/v1/auth"
USERS_URL = "/api/v1/users"


async def create_user(
    client: AsyncClient,
    *,
    email: str = "user@example.com",
    password: str = "password1",
) -> dict[str, str]:
    response = await client.post(
        USERS_URL,
        json={"email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()


async def login(
    client: AsyncClient,
    *,
    email: str = "user@example.com",
    password: str = "password1",
) -> dict[str, str]:
    response = await client.post(
        f"{AUTH_URL}/login/email",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_login_returns_token_pair(
    api_client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
) -> None:
    await create_user(api_client)

    tokens = await login(api_client)

    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"
    assert fake_refresh_token_repository.token_count == 1


async def test_login_rejects_wrong_password(api_client: AsyncClient) -> None:
    await create_user(api_client)

    response = await api_client.post(
        f"{AUTH_URL}/login/email",
        json={"email": "user@example.com", "password": "wrong-password1"},
    )

    assert response.status_code == 401
    assert response.json() == {"message": "Incorrect login or password"}


async def test_login_rejects_unknown_email(api_client: AsyncClient) -> None:
    response = await api_client.post(
        f"{AUTH_URL}/login/email",
        json={"email": "missing@example.com", "password": "password1"},
    )

    assert response.status_code == 401
    assert response.json() == {"message": "Incorrect login or password"}


async def test_refresh_rotates_refresh_token(
    api_client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
) -> None:
    await create_user(api_client)
    tokens = await login(api_client)

    response = await api_client.post(
        f"{AUTH_URL}/refresh",
        headers=bearer(tokens["refresh_token"]),
    )

    assert response.status_code == 200
    rotated = response.json()
    assert rotated["access_token"]
    assert rotated["refresh_token"] != tokens["refresh_token"]
    assert fake_refresh_token_repository.token_count == 1

    reused = await api_client.post(
        f"{AUTH_URL}/refresh",
        headers=bearer(tokens["refresh_token"]),
    )
    assert reused.status_code == 401


async def test_logout_revokes_refresh_token(
    api_client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
) -> None:
    await create_user(api_client)
    tokens = await login(api_client)

    response = await api_client.post(
        f"{AUTH_URL}/logout",
        headers=bearer(tokens["refresh_token"]),
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Logged out"}
    assert fake_refresh_token_repository.token_count == 0

    reused = await api_client.post(
        f"{AUTH_URL}/refresh",
        headers=bearer(tokens["refresh_token"]),
    )
    assert reused.status_code == 401


@pytest.mark.parametrize("path", ["/refresh", "/logout"])
async def test_auth_endpoints_require_refresh_token(
    api_client: AsyncClient,
    path: str,
) -> None:
    response = await api_client.post(f"{AUTH_URL}{path}")

    assert response.status_code == 401
    assert response.json() == {"message": "Missing bearer token"}


async def test_refresh_rejects_invalid_token(api_client: AsyncClient) -> None:
    response = await api_client.post(
        f"{AUTH_URL}/refresh",
        headers={"Authorization": "Bearer not-a-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"message": "Invalid token"}


async def test_current_user_requires_access_token(api_client: AsyncClient) -> None:
    response = await api_client.get(f"{USERS_URL}/")

    assert response.status_code == 401
    assert response.json() == {"message": "Missing bearer token"}


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "password1"},
        {"email": "user@example.com"},
    ],
)
async def test_login_validates_request(
    api_client: AsyncClient,
    payload: dict[str, str],
) -> None:
    response = await api_client.post(f"{AUTH_URL}/login/email", json=payload)

    assert response.status_code == 422
