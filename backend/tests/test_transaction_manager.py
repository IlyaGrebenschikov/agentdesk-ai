from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend.application.exceptions import (
    CommitError,
    ConflictError,
    RollbackError,
    TransactionAlreadyStartedError,
)
from backend.infrastructure.database.transaction_manager import TransactionManager


@pytest.fixture
def transaction() -> MagicMock:
    transaction = MagicMock()
    transaction.commit = AsyncMock()
    transaction.rollback = AsyncMock()
    return transaction


@pytest.fixture
def session(transaction: MagicMock) -> MagicMock:
    session = MagicMock()
    session.in_transaction.return_value = False
    session.begin = AsyncMock(return_value=transaction)
    session.rollback = AsyncMock()
    return session


async def test_commits_on_success(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    async with TransactionManager(session):
        pass

    session.begin.assert_awaited_once()
    transaction.commit.assert_awaited_once()
    transaction.rollback.assert_not_awaited()
    session.rollback.assert_not_awaited()


async def test_raises_when_session_already_has_transaction(
    session: MagicMock,
) -> None:
    session.in_transaction.return_value = True

    with pytest.raises(TransactionAlreadyStartedError):
        async with TransactionManager(session):
            pass

    session.begin.assert_not_awaited()


async def test_rolls_back_and_reraises_original_error(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    with pytest.raises(RuntimeError, match="boom"):
        async with TransactionManager(session):
            raise RuntimeError("boom")

    transaction.rollback.assert_awaited_once()
    transaction.commit.assert_not_awaited()


async def test_integrity_error_on_commit_becomes_conflict(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    integrity_error = IntegrityError("INSERT", {}, Exception("duplicate"))
    transaction.commit.side_effect = integrity_error

    with pytest.raises(ConflictError, match="Resource conflict") as exc_info:
        async with TransactionManager(session):
            pass

    assert exc_info.value.__cause__ is integrity_error
    session.rollback.assert_awaited_once()


async def test_database_error_on_commit_becomes_commit_error(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    original = SQLAlchemyError("commit failed")
    transaction.commit.side_effect = original

    with pytest.raises(CommitError) as exc_info:
        async with TransactionManager(session):
            pass

    assert exc_info.value.original_error is original
    session.rollback.assert_awaited_once()


async def test_rollback_error_becomes_rollback_error(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    original = SQLAlchemyError("rollback failed")
    transaction.rollback.side_effect = original

    with pytest.raises(RollbackError) as exc_info:
        async with TransactionManager(session):
            raise RuntimeError("original failure")

    assert exc_info.value.original_error is original


async def test_commit_failure_survives_failed_cleanup_rollback(
    session: MagicMock,
    transaction: MagicMock,
) -> None:
    original = SQLAlchemyError("commit failed")
    transaction.commit.side_effect = original
    session.rollback.side_effect = SQLAlchemyError("cleanup rollback failed")

    with pytest.raises(CommitError) as exc_info:
        async with TransactionManager(session):
            pass

    assert exc_info.value.original_error is original
    session.rollback.assert_awaited_once()
