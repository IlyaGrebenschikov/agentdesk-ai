import asyncio
import logging
import sys

from .core.ioc import setup_ioc
from .core.settings import load_settings
from .infrastructure.server import run_uvicorn_server
from .presentation.api import init_api


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    settings = load_settings()
    ioc = setup_ioc(settings)
    app = init_api(settings, ioc)

    await run_uvicorn_server(app, settings.server)


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
