from uuid import uuid4

from backend.domain import User


def test_user_repr_hides_password_hash() -> None:
    user = User(
        id=uuid4(),
        email="user@example.com",
        password_hash="secret-password-hash",
    )

    representation = repr(user)

    assert "secret-password-hash" not in representation
    assert "user@example.com" in representation
