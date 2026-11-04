# DayWave

**Your day, connected to one personal AI assistant — with full visibility into what it does.**

DayWave is an open-source personal AI assistant web application. It takes context from the services you already use, helps you plan your day, answers questions grounded in your real data, performs agreed actions on your behalf, and runs automations on a schedule.

The web application is the main interface and control center. Telegram is an additional channel for notifications and quick results — not the core of the product.

> **Status:** Early development. The foundation is in place: configuration, PostgreSQL migrations, health checks, and email/password authentication with access and refresh tokens (already integrated into the frontend). Calendar, chat, and automations are next; screens without a backend running behind them use local mock data in the default `hybrid` mode.

## The Problem

Personal context is scattered: one part of your day lives in the calendar, another in email and notes, decisions get made in messengers. Generic chatbots know nothing about any of it, so every answer starts with you retyping your plan.

DayWave is built around a different flow:

- Connect your calendar and other everyday services — the assistant reads from them directly.
- Ask about your day and get an answer based on real events, not inventations.
- See exactly which sources were used, which tools were called, and how the execution finished.
- Keep external actions behind an explicit confirmation, so the assistant can't move a meeting on its own.

## Core Scenarios (MVP)

- Get a morning summary: today's meetings, important emails, and tasks.
- Ask the assistant about your schedule or the contents of connected sources.
- Find a free slot and get a meeting suggestion.
- Receive a Telegram notification about an important event or an automation result.
- Run a recurring workflow, e.g. the daily briefing digest.
- Review the history of assistant actions and understand where each result came from.

### What the first MVP includes

- Registration, login, logout, and session management.
- Web dashboard, chat with the AI assistant.
- One LLM provider behind an own abstraction; one agent with a limited tool-calling loop.
- Google Calendar via OAuth; reading calendar events and answering questions about the schedule.
- Telegram as a delivery channel for notifications.
- Simple scheduled automations; history of runs and tool calls.
- Explicit confirmation before any action that changes external data.

### What stays out of the first MVP

Visual agent/graph builders, multi-agent systems, arbitrary code execution, full email sending, RAG over arbitrary files, voice, mobile apps, marketplace, and payments. One reliable agent with a small tool set beats a do-everything Jarvis.

## Architecture

DayWave is a modular monolith on FastAPI with vertical slices and explicit layer boundaries.

### Planned Technology Stack

| Component | Technology |
| --- | --- |
| Frontend | Vue 3 (Composition API), Vite, Vue Router |
| Backend API | FastAPI, Pydantic v2 |
| Persistence | PostgreSQL, SQLAlchemy 2.x async, Alembic |
| Auth | Argon2id password hashing, RS256 JWTs, Redis-backed refresh tokens |
| Cache and queue layer | Redis |
| Background workers | Taskiq / Celery / ARQ (one tool to be picked) |
| AI | One LLM provider behind own interface, structured outputs, tool calling |
| Notifications | Telegram Bot API |
| Infrastructure | Docker Compose, GitHub Actions, structured logs |
| Testing | pytest: unit, integration, API, and agent evaluation tests |

LangChain/LangGraph are deliberately not required: no framework for the framework's sake — a plain controlled agent loop is the default, orchestration libraries join only when the simple loop stops covering scenarios.

### Modules

| Module | Responsibility |
| --- | --- |
| identity | Users, passwords, sessions |
| integrations | OAuth, connections, tokens, external service adapters |
| conversations | Dialogs and messages |
| agent | LLM orchestration, tool registry, agent runs |
| automations | Rules, schedules, runs |
| notifications | Telegram and other delivery channels |
| audit | History of meaningful actions and diagnostics |

### Layers

- **Domain:** plain entities, value objects, and business rules independent of infrastructure.
- **Application:** use cases/handlers, DTOs, ports, and orchestration.
- **Infrastructure:** SQLAlchemy, external SDKs, LLM clients, queues, OAuth storage.
- **Presentation:** FastAPI routers and Pydantic schemas, translating HTTP into application DTOs.
- **Workers:** entry points for background jobs; business scenarios are called through the application layer.

Pydantic schemas and ORM models never cross into application handlers; external providers and repositories are plugged in through interfaces.

### Transparency and safety by design

- Every agent run leaves a trace: model, tool calls, arguments, statuses, errors, and durations.
- Tools have strict input schemas and an allowlist; the agent loop is capped by iterations and time.
- Actions that change external data require user confirmation bound to a specific proposal, with an idempotency key so nothing executes twice.
- Scheduled runs are idempotent: a digest is never sent twice on retry.

## Getting Started

### Run the full stack with Docker

JWT signing keys are not committed. Generate them once from the repository root:

```bash
mkdir -p backend/.certs
openssl genrsa -out backend/.certs/jwt-private.pem 2048
openssl rsa -in backend/.certs/jwt-private.pem -pubout -out backend/.certs/jwt-public.pem
chmod 600 backend/.certs/jwt-private.pem
```

Start the stack:

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| API | http://localhost:8080 |
| Health check | http://localhost:8080/api/v1/health/ready |
| PostgreSQL | `127.0.0.1:5432` |
| Redis | `127.0.0.1:6379` |

The one-shot `migrate` service applies Alembic migrations before the API starts. Run `docker compose up --build` again after changing Dockerfiles, `pyproject.toml`, or `uv.lock`; otherwise Compose reuses the previous image.

PostgreSQL and Redis are available on localhost through `socat` port forwarders, so local tools can connect with the default credentials (`daywave` / `daywave`).

### Frontend modes

The frontend reads `VITE_API_MODE` (default `hybrid`):

- `hybrid` — authentication goes to the real backend; when the API is unreachable, the UI falls back to local demo behavior so the application works even without the backend. Backend validation errors (401/409/422) are always shown to the user, never masked by the fallback.
- anything else (`api`) — strict mode: every request must reach the backend, network failures are errors.

Dashboards, chat, calendar, and automations screens still use local mock data — the corresponding backend endpoints arrive with the next stages.

### Local development

Backend (from `backend/`):

```bash
uv sync
uv run alembic upgrade head
uv run backend
```

Frontend (from `frontend/`):

```bash
npm install
npm run dev
```

### Checks

```bash
# backend
uv run pytest
uv run ruff check src tests
uv run mypy src tests

# frontend
npm run build
```

## Implemented API

### Authentication

- `POST /api/v1/users` — register a user.
- `POST /api/v1/auth/login/email` — log in and receive an access/refresh token pair.
- `POST /api/v1/auth/refresh` — rotate the refresh token and issue a new pair.
- `POST /api/v1/auth/logout` — revoke the refresh token.
- `GET /api/v1/users/` — return the current user from the access token.

Passwords are hashed with Argon2id. Tokens are RS256 JWTs; refresh token IDs are stored in Redis so they can be rotated and revoked. Access and refresh lifetimes are configured with `JWT_ACCESS_EXPIRATION_MINUTES` and `JWT_REFRESH_EXPIRATION_MINUTES`.

Calendar, chat, agent, and automation endpoints are not implemented yet — they are the next development stages.

## Development Roadmap

| Release | Content | Result |
| --- | --- | --- |
| 0.1 | Foundation, DB, configuration, health checks | ✅ Running base |
| 0.2 | Registration, sessions, frontend auth integration | ✅ Personal accounts |
| 0.3 | Google Calendar OAuth + event reading | Real user context |
| 0.4 | Chat + one agent + calendar tools | First useful AI scenario |
| 0.5 | Telegram linking + notifications | The assistant outside the browser |
| 0.6 | Scheduler + worker + daily briefing | First automation |
| 0.7 | Confirmable actions + audit | Safe execution of actions |
| 0.8+ | Gmail, Notion, RAG, additional workflows | Product expansion |

A feature is done when: the user scenario and acceptance criteria are clear, happy path and main errors are covered, ownership checks pass, business logic has tests, the UI has loading/empty/error states, and the API contract is documented.

## Design Principles

1. **Web-first.** Every scenario is available in the browser; Telegram is a delivery channel, not the product.
2. **Integrations as tools.** Calendar, email, and notes connect independently; each tool has a strict contract.
3. **User control.** Before external or potentially harmful actions, the assistant asks for confirmation — and never approves its own actions.
4. **Transparency.** The user sees which sources were used, which tools ran, and how the execution finished.
5. **Reliable execution.** Long jobs run asynchronously with logs, retries, backoff, and idempotency.
6. **Gradual AI complexity.** One manageable agent first; multi-agent platforms and agent builders only if the real need appears.

## Contributing

Contributions, ideas, bug reports, and feedback are welcome. The product and MVP plan lives in [`docs/DayWave-MVP-Roadmap.md`](docs/DayWave-MVP-Roadmap.md).

Before opening a pull request:

1. Describe the problem the change solves.
2. Keep changes focused and include tests where applicable.
3. Update documentation when behavior or API contracts change.
