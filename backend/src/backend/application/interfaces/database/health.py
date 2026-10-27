from typing import Protocol


class IDatabaseHealthChecker(Protocol):
    async def check(self) -> None: ...
