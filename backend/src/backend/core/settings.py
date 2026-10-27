import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr
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


@dataclass(frozen=True, slots=True)
class Settings:
    database: DatabaseSettings
    server: ServerSettings

    @property
    def backend_dir(self) -> Path:
        return BACKEND_DIR


@lru_cache
def load_settings() -> Settings:
    log.debug("Loading settings from %s", ENV_FILE)
    return Settings(
        database=DatabaseSettings(),  # type: ignore[call-arg]
        server=ServerSettings(),
    )
