# AgentDesk

**Build, run, and debug AI workflows — with full visibility into every step.**

AgentDesk is an open-source, low-code platform for building AI workflows visually. It aims to make AI agent execution easier to understand, inspect, and debug through detailed execution traces, node-level diagnostics, and transparent run history.

Unlike tools focused primarily on workflow construction, AgentDesk puts **debuggability and execution observability at the center of the developer experience**.

> **Status:** Early development. The backend foundation is in place: configuration, PostgreSQL migrations, Redis, and email/password authentication with access and refresh tokens. Workflow execution and integrations are still being developed, so the frontend uses mock workflow data in the default `hybrid` mode.

## The Problem

Building an AI workflow is only part of the challenge. Understanding why it failed can be much harder.

When an LLM returns an unexpected result, a tool call times out, or a workflow stops midway, developers need answers to questions such as:

- Which node failed, and what caused the failure?
- What input did the node receive, and what output did it produce?
- How long did each step take?
- How many tokens were consumed, and how much did the execution cost?
- Can a failed step be retried without rerunning the entire workflow?
- Can a previous execution be inspected and reproduced?

AgentDesk is being designed to make these questions easy to answer.

## Planned Features

### Visual Workflow Builder

- Create workflows using a visual node-based editor.
- Connect nodes to define execution flow.
- Configure LLMs, tools, conditions, inputs, and outputs.
- Validate workflow graphs before execution.
- Save and version workflow definitions.

### Execution Debugger

- Inspect execution status directly on the workflow graph.
- View the input and output of individual nodes.
- Explore chronological execution events and logs.
- Inspect errors, exception details, and stack traces.
- Track node duration, token usage, and estimated LLM cost.
- Compare successful and failed runs.
- Retry failed steps where execution semantics allow it.

### AI Integration

- Integrate LLM providers through a replaceable adapter layer.
- Build agent workflows with tool calling.
- Use LangGraph as the workflow execution runtime.
- Use LangChain integrations where they simplify model and tool configuration.
- Keep AgentDesk's workflow definitions and debugging data independent of framework-specific types.

### Background Execution

- Execute workflows outside the API request lifecycle.
- Track queued, running, completed, failed, and cancelled executions.
- Handle timeouts, retries, and worker failures.
- Persist execution events for post-run debugging.

### Retrieval-Augmented Generation (Planned)

- Connect knowledge bases to AI agents.
- Store and search document embeddings with Qdrant.
- Support metadata filtering and retrieval configuration.
- Expose retrieved documents and relevant chunks in execution traces.
- Add RAG components to the visual workflow builder.

## Architecture

AgentDesk is planned as a modular backend with a layered architecture and an explicit separation between application logic and infrastructure.

### Planned Technology Stack

| Component | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Workflow editor | React Flow (`@xyflow/react`) |
| Backend API | FastAPI, Pydantic |
| Application and domain models | Python dataclasses and enums |
| Persistence | PostgreSQL, SQLAlchemy 2.x, Alembic |
| Workflow runtime | LangGraph |
| LLM and tool integrations | LangChain where appropriate |
| Background messaging | RabbitMQ |
| Cache and temporary state | Redis |
| Vector search and RAG | Qdrant |
| Testing | pytest, integration and failure-injection tests |

The stack describes the intended architecture. Not all components are integrated yet.

### Backend Layers

The backend is planned around four main layers:

- **Presentation:** FastAPI endpoints, request validation, and API response schemas.
- **Application:** use cases, execution orchestration, and application-level DTOs.
- **Domain:** plain dataclasses, enums, and core business rules.
- **Infrastructure:** SQLAlchemy models, repositories, database access, messaging, and external integrations.

The domain and application layers should not depend on FastAPI, Pydantic, or SQLAlchemy ORM models.

Domain models are intentionally anemic: business workflows and orchestration belong in application services and use cases rather than in ORM entities.

### Debugging Architecture

AgentDesk's debugging model is intended to remain independent of the underlying workflow runtime.

The platform will translate runtime events into its own trace representation, including:

- Workflow and execution identifiers.
- Node identifiers and execution status.
- Start and finish timestamps.
- Input and output snapshots, subject to configured redaction.
- Error categories, messages, and diagnostic details.
- Token usage and cost metadata when available.

This creates a consistent debugging experience even as the underlying execution framework evolves.

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
| API docs | http://localhost:8080/docs |
| Health check | http://localhost:8080/api/v1/health/ready |
| PostgreSQL | `127.0.0.1:5432` |
| Redis | `127.0.0.1:6379` |

The one-shot `migrate` service applies Alembic migrations before the API starts. Run `docker compose up --build` again after changing Dockerfiles, `pyproject.toml`, or `uv.lock`; otherwise Compose reuses the previous image.

PostgreSQL and Redis are available on localhost through `socat` port forwarders, so local tools can connect with the default credentials (`agentdesk` / `agentdesk`).

### Frontend modes

The frontend supports three modes via `VITE_API_MODE`:

- `hybrid` (default) — authentication goes to the real FastAPI backend; workflow, execution, and tool data still comes from the local mock because those endpoints do not exist yet.
- `api` — everything goes through FastAPI. Use it once workflow and execution routes are implemented.
- `mock` — fully local demo with seeded data and the `demo@agentdesk.dev` / `demo1234` account.

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
npm run typecheck
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

Workflow, execution, and tool endpoints are not implemented yet. The frontend keeps using mock data for them.

## Development Roadmap

The project is being developed incrementally.

- [x] **Foundation:** project structure, configuration, database migrations, and authentication.
- [ ] **Workflow editor:** node creation, connections, configuration panels, and graph validation.
- [ ] **Workflow persistence:** save workflows and immutable published versions.
- [ ] **Execution runtime:** integrate LangGraph and execute supported node types.
- [ ] **Debugging:** persist node-level traces, errors, logs, and execution metrics.
- [ ] **Background workers:** queue executions and handle timeouts, retries, and recovery.
- [ ] **LLM integrations:** configurable providers, tool calling, and usage tracking.
- [ ] **RAG:** document ingestion, embeddings, Qdrant retrieval, and source inspection.
- [ ] **Hardening:** permissions, secret handling, observability, and failure-injection tests.

The initial MVP focuses on a small set of node types and predictable execution semantics. More advanced graph features, including arbitrary cycles and complex multi-agent coordination, can be added later.

## Design Principles

1. **Debuggability first.** Every execution should leave enough diagnostic information to explain what happened.
2. **Explicit execution state.** Workflow and node state transitions should be observable and testable.
3. **Frameworks are implementation details.** AgentDesk's public workflow and trace models should not depend on LangGraph or LangChain internals.
4. **Reliable by design.** Retries and recovery must account for duplicate delivery and external side effects.
5. **Security by default.** Tool permissions, execution limits, secret redaction, and tenant isolation must be considered as the platform evolves.

## Contributing

Contributions, ideas, bug reports, and feedback are welcome.

Before opening a pull request:

1. Describe the problem the change solves.
2. Keep changes focused and include tests where applicable.
3. Update documentation when behavior or API contracts change.
