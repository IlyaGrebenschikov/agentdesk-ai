from pwdlib import PasswordHash

from backend.application.interfaces.pwd_hasher import IPwdHasher


class Argon2PwdHasher(IPwdHasher):
    def __init__(self, hasher: PasswordHash) -> None:
        self._hasher = hasher

    def hash_password(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self._hasher.verify(plain_password, hashed_password)
