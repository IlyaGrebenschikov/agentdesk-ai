import asyncio
import logging
import sys

from fastapi import FastAPI

from .core.settings import load_settings
from .infrastructure.server import run_uvicorn_server


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    settings = load_settings()
    app = FastAPI()

    await run_uvicorn_server(app, settings.server)


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
