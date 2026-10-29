from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

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


async def test_create_user_returns_created_user(api_client: AsyncClient) -> None:
    response = await api_client.post(
        USERS_URL,
        json={"email": "user@example.com", "password": "password1"},
    )

    assert response.status_code == 201
    data = response.json()
    assert UUID(data["id"])
    assert data["email"] == "user@example.com"
    assert "password" not in data
    assert "password_hash" not in data


async def test_create_user_rejects_duplicate_email(
    api_client: AsyncClient,
) -> None:
    await create_user(api_client)

    response = await api_client.post(
        USERS_URL,
        json={"email": "user@example.com", "password": "password1"},
    )

    assert response.status_code == 409
    assert response.json() == {"message": "User with this email already exists"}


async def test_create_user_normalizes_email_case(api_client: AsyncClient) -> None:
    created = await create_user(api_client, email="User@Example.COM")

    assert created["email"] == "user@example.com"

    response = await api_client.post(
        USERS_URL,
        json={"email": "user@example.com", "password": "password1"},
    )

    assert response.status_code == 409


async def test_create_user_rejects_too_long_email(api_client: AsyncClient) -> None:
    local_part = "a" * 64
    domain = ".".join(["b" * 63, "c" * 63, "d" * 58])
    email = f"{local_part}@{domain}"

    response = await api_client.post(
        USERS_URL,
        json={"email": email, "password": "password1"},
    )

    assert response.status_code == 422
    assert "250" in response.text


@pytest.mark.parametrize(
    ("password", "expected_message"),
    [
        ("short1", "Password must be at least 8 characters long"),
        ("password", "Password must contain at least one digit"),
        ("12345678", "Password must contain at least one letter"),
    ],
)
async def test_create_user_rejects_weak_password(
    api_client: AsyncClient,
    password: str,
    expected_message: str,
) -> None:
    response = await api_client.post(
        USERS_URL,
        json={"email": "user@example.com", "password": password},
    )

    assert response.status_code == 422
    assert expected_message in response.text


async def test_get_user_returns_user_by_id(api_client: AsyncClient) -> None:
    created = await create_user(api_client)

    response = await api_client.get(f"{USERS_URL}/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created
    assert "password_hash" not in response.json()


async def test_get_user_returns_404_for_missing_user(
    api_client: AsyncClient,
) -> None:
    response = await api_client.get(f"{USERS_URL}/{uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"message": "User not found"}


async def test_get_user_rejects_invalid_uuid(api_client: AsyncClient) -> None:
    response = await api_client.get(f"{USERS_URL}/not-a-uuid")

    assert response.status_code == 422
