from __future__ import annotations

import logging
from types import TracebackType
from typing import Self

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncSessionTransaction,
)

from backend.application.exceptions import (
    CommitError,
    ConflictError,
    RollbackError,
    TransactionAlreadyStartedError,
)
from backend.application.interfaces.database.transaction_manager import (
    ITransactionManager,
)

log = logging.getLogger(__name__)


class TransactionManager(ITransactionManager):
    """
    Async context manager for explicit transaction control.

    Guarantees atomic database operations by wrapping code in a transaction.
    Commits on successful exit, rolls back on exception.

    Usage in services:
       async def create_user(self, dto: CreateUserDTO) -> User:
           async with self._transaction_manager:
               # All database operations here are atomic
               user = await self._repository.create(dto)
               await self._audit.log("user_created", user.id)
               return user
           # Automatically committed here, or rolled back if exception occurred

    Important:
       - Session must NOT be in transaction before entering context (no autobegin)
       - All database operations should be inside the async with block
       - Session and transaction manager lifecycle is managed by DI
       - The manager must be request-scoped, never a singleton
       - Supports sequential transactions (multiple async with blocks per request)
       - Nested transactions are NOT supported

    Raises:
       TransactionAlreadyStartedError: If the session already has an active
           transaction (autobegin protection)
       ConflictError: If a statement or commit fails because of an integrity
           constraint
       CommitError: If commit fails for any other database reason
       RollbackError: If rollback fails
    """

    __slots__ = ("_session", "_transaction")

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._transaction: AsyncSessionTransaction | None = None

    async def __aenter__(self) -> Self:
        if self._session.in_transaction():
            raise TransactionAlreadyStartedError
        self._transaction = await self._session.begin()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        transaction = self._transaction
        self._transaction = None

        if transaction is None:
            return

        if exc_type is not None:
            try:
                await transaction.rollback()
            except SQLAlchemyError as err:
                raise RollbackError(err) from err
            if isinstance(exc_value, IntegrityError):
                raise ConflictError("Resource conflict") from exc_value
            return

        try:
            await transaction.commit()
        except IntegrityError as err:
            await self._rollback_after_commit_failure()
            raise ConflictError("Resource conflict") from err
        except SQLAlchemyError as err:
            await self._rollback_after_commit_failure()
            raise CommitError(err) from err

    async def _rollback_after_commit_failure(self) -> None:
        try:
            await self._session.rollback()
        except SQLAlchemyError:
            log.exception("Failed to rollback session after commit error")
