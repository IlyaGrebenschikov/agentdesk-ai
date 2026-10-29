import pytest
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from backend.infrastructure.pwd_hasher import Argon2PwdHasher

PASSWORD = "correct horse battery staple"


@pytest.fixture(scope="module")
def pwd_hasher() -> Argon2PwdHasher:
    return Argon2PwdHasher(PasswordHash.recommended())


@pytest.fixture(scope="module")
def password_hash(pwd_hasher: Argon2PwdHasher) -> str:
    return pwd_hasher.hash_password(PASSWORD)


def test_hash_password_returns_hash_not_equal_to_password(
    password_hash: str,
) -> None:
    assert password_hash != PASSWORD
    assert PASSWORD not in password_hash


def test_verify_password_accepts_correct_password(
    pwd_hasher: Argon2PwdHasher,
    password_hash: str,
) -> None:
    assert pwd_hasher.verify_password(PASSWORD, password_hash) is True


def test_verify_password_rejects_wrong_password(
    pwd_hasher: Argon2PwdHasher,
    password_hash: str,
) -> None:
    assert pwd_hasher.verify_password("wrong password", password_hash) is False


def test_hash_password_uses_unique_salt(
    pwd_hasher: Argon2PwdHasher,
    password_hash: str,
) -> None:
    other_hash = pwd_hasher.hash_password(PASSWORD)

    assert other_hash != password_hash
    assert pwd_hasher.verify_password(PASSWORD, other_hash) is True


def test_verify_password_rejects_unknown_hash(
    pwd_hasher: Argon2PwdHasher,
) -> None:
    with pytest.raises(UnknownHashError):
        pwd_hasher.verify_password(PASSWORD, "not-a-valid-hash")
