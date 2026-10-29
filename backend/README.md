# Backend

## Migrations

Alembic configuration lives in `alembic.ini`, migration scripts in
`src/backend/infrastructure/database/migrations`.

Local usage (from the `backend/` directory, with a configured `.env`):

```bash
uv run alembic revision --autogenerate -m "add users table"
uv run alembic upgrade head
uv run alembic downgrade -1
```

In Docker Compose the `migrate` service runs `alembic upgrade head` before the
`api` service starts.
