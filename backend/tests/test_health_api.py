import pytest
from httpx import AsyncClient

from backend.application.exceptions import ServiceUnavailableError
from tests.fakes import FakeDatabaseHealthChecker


@pytest.mark.parametrize(
    ("path", "expected_calls"),
    [
        ("/api/v1/health/live", 0),
        ("/api/v1/health/ready", 1),
    ],
)
async def test_health_endpoints_return_ok(
    api_client: AsyncClient,
    fake_db_checker: FakeDatabaseHealthChecker,
    path: str,
    expected_calls: int,
) -> None:
    response = await api_client.get(path)

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert fake_db_checker.calls == expected_calls


async def test_readiness_returns_503_when_database_is_unavailable(
    api_client: AsyncClient,
    fake_db_checker: FakeDatabaseHealthChecker,
) -> None:
    fake_db_checker.error = ServiceUnavailableError("Database is unavailable")

    response = await api_client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json() == {"message": "Database is unavailable"}


async def test_readiness_hides_unexpected_errors(
    api_client: AsyncClient,
    fake_db_checker: FakeDatabaseHealthChecker,
) -> None:
    fake_db_checker.error = RuntimeError("internal secret")

    response = await api_client.get("/api/v1/health/ready")

    assert response.status_code == 500
    assert response.json() == {"message": "Unknown Error"}
    assert "internal secret" not in response.text
