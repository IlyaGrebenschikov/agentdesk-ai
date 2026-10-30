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

## JWT keys

Access and refresh tokens are signed with an asymmetric key pair. The keys are
read from `backend/.certs` by default; override the location with `JWT_CERTS_DIR`.
The directory is gitignored, so private keys are never committed.

Generate a key pair (from the `backend/` directory):

```bash
mkdir -p .certs
openssl genrsa -out .certs/jwt-private.pem 2048
openssl rsa -in .certs/jwt-private.pem -pubout -out .certs/jwt-public.pem
chmod 600 .certs/jwt-private.pem
```

The `api` service in `docker-compose.yaml` mounts `backend/.certs` into the
container read-only, so the same keys are used locally and in Docker. The
directory is excluded from the Docker build context by `.dockerignore`, so keys
are only provided at runtime.

Token lifetimes are configured in minutes with
`JWT_ACCESS_EXPIRATION_MINUTES` (default `30`) and
`JWT_REFRESH_EXPIRATION_MINUTES` (default `43200`, i.e. 30 days).
