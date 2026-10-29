import asyncio
from typing import NewType

PwdHashLimiter = NewType("PwdHashLimiter", asyncio.Semaphore)
