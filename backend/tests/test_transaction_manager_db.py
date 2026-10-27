import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.application.exceptions import ConflictError, TransactionAlreadyStartedError
from backend.infrastructure.database.transaction_manager import TransactionManager


async def test_commit_persists_changes(
    sqlite_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with sqlite_session_factory() as session, TransactionManager(session):
        await session.execute(
            text("INSERT INTO items (id, name) VALUES (1, 'alpha')"),
        )

    async with sqlite_session_factory() as session:
        result = await session.execute(text("SELECT name FROM items WHERE id = 1"))
        assert result.scalar_one() == "alpha"


async def test_rollback_discards_changes(
    sqlite_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with sqlite_session_factory() as session:
        with pytest.raises(RuntimeError, match="boom"):
            async with TransactionManager(session):
                await session.execute(
                    text("INSERT INTO items (id, name) VALUES (1, 'rolled-back')")
                )
                raise RuntimeError("boom")

    async with sqlite_session_factory() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM items"))
        assert result.scalar_one() == 0


async def test_integrity_error_inside_transaction_becomes_conflict(
    sqlite_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with sqlite_session_factory() as session, TransactionManager(session):
        await session.execute(text("INSERT INTO items (id, name) VALUES (1, 'alpha')"))

    async with sqlite_session_factory() as session:
        with pytest.raises(ConflictError, match="Resource conflict") as exc_info:
            async with TransactionManager(session):
                await session.execute(
                    text("INSERT INTO items (id, name) VALUES (2, 'alpha')")
                )

    assert isinstance(exc_info.value.__cause__, IntegrityError)

    async with sqlite_session_factory() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM items"))
        assert result.scalar_one() == 1


async def test_rejects_already_started_transaction(
    sqlite_session: AsyncSession,
) -> None:
    await sqlite_session.execute(text("SELECT 1"))
    assert sqlite_session.in_transaction()

    with pytest.raises(TransactionAlreadyStartedError):
        async with TransactionManager(sqlite_session):
            pass

    await sqlite_session.rollback()


async def test_supports_sequential_transactions(
    sqlite_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with sqlite_session_factory() as session:
        transaction_manager = TransactionManager(session)

        async with transaction_manager:
            await session.execute(
                text("INSERT INTO items (id, name) VALUES (1, 'first')")
            )

        async with transaction_manager:
            await session.execute(
                text("INSERT INTO items (id, name) VALUES (2, 'second')")
            )

    async with sqlite_session_factory() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM items"))
        assert result.scalar_one() == 2
