import logging
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = BACKEND_DIR / ".env"


class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class DatabaseSettings(EnvSettings):
    model_config = SettingsConfigDict(env_prefix="DB_")

    drivername: str = "postgresql+asyncpg"
    host: str
    port: Annotated[int, Field(ge=1, le=65535)]
    username: str
    password: SecretStr
    database: str
    health_check_timeout: Annotated[float, Field(gt=0)] = 5.0

    @property
    def url_obj(self) -> URL:
        return URL.create(
            drivername=self.drivername,
            username=self.username,
            password=self.password.get_secret_value(),
            host=self.host,
            port=self.port,
            database=self.database,
        )

    @property
    def safe_url(self) -> str:
        return self.url_obj.render_as_string(hide_password=True)


class ServerSettings(EnvSettings):
    model_config = SettingsConfigDict(env_prefix="SERVER_")

    host: str = "0.0.0.0"
    port: Annotated[int, Field(ge=1, le=65535)] = 8080


class CorsSettings(EnvSettings):
    model_config = SettingsConfigDict(env_prefix="CORS_")

    origins: list[str] = ["*"]
    methods: list[str] = ["*"]
    headers: list[str] = ["*"]


class PwdHashSettings(EnvSettings):
    model_config = SettingsConfigDict(env_prefix="PWD_HASH_")

    max_threads: Annotated[int, Field(ge=1)] = 4


JWAlgorithm = Literal["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"]


class JWTSettings(EnvSettings):
    model_config = SettingsConfigDict(env_prefix="JWT_")

    algorithm: JWAlgorithm = "RS256"
    access_expiration_minutes: Annotated[
        int, Field(ge=1, description="Access token lifetime in minutes")
    ] = 30
    refresh_expiration_minutes: Annotated[
        int, Field(ge=1, description="Refresh token lifetime in minutes")
    ] = 60 * 24 * 30
    certs_dir: Path = BACKEND_DIR / ".certs"

    @model_validator(mode="after")
    def _validate_expirations(self) -> Self:
        if self.refresh_expiration_minutes < self.access_expiration_minutes:
            raise ValueError(
                "Refresh token lifetime must not be shorter than access token lifetime"
            )
        return self

    @cached_property
    def private_key(self) -> str:
        return self._read_key("jwt-private.pem")

    @cached_property
    def public_key(self) -> str:
        return self._read_key("jwt-public.pem")

    def _read_key(self, filename: str) -> str:
        key_path = self.certs_dir / filename
        try:
            return key_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            raise FileNotFoundError(f"JWT key file not found: {key_path}") from None


@dataclass(frozen=True, slots=True)
class Settings:
    database: DatabaseSettings
    server: ServerSettings
    cors: CorsSettings
    pwd_hash: PwdHashSettings
    jwt: JWTSettings

    @property
    def backend_dir(self) -> Path:
        return BACKEND_DIR


@lru_cache
def load_settings() -> Settings:
    log.debug("Loading settings from %s", ENV_FILE)
    return Settings(
        database=DatabaseSettings(),  # type: ignore[call-arg]
        server=ServerSettings(),
        cors=CorsSettings(),
        pwd_hash=PwdHashSettings(),
        jwt=JWTSettings(),
    )
