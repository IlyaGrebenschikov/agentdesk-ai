import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.settings import CorsSettings

log = logging.getLogger(__name__)


def setup_cors_middleware(app: FastAPI, cors: CorsSettings) -> None:
    log.info("Setting up CORS middleware")
    has_wildcard = "*" in cors.origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors.origins,
        allow_credentials=not has_wildcard,
        allow_methods=cors.methods,
        allow_headers=cors.headers,
    )
