---
name: project-bug-report
description: Audit the entire repository for bugs, syntax errors, runtime risks, security issues, configuration mistakes, and refactoring opportunities, then write project-bug-report.md at the repository root. Use when the user asks for a full project audit, whole-codebase bug report, repository-wide review, or a general list of bugs and improvements.
---

# Project Bug Report

Review the whole repository, not only the current branch diff. Produce a prioritized, evidence-based Markdown report at the repository root. Do not modify application code, stage files, or commit anything unless the user explicitly asks.

## 1. Define the scope

Use tracked and non-ignored untracked files as the review scope:

```bash
git ls-files
git ls-files --others --exclude-standard
```

Exclude generated, vendored, and dependency content:

- `.git/`, `node_modules/`, `.venv/`, `dist/`, `build/`, coverage output
- `__pycache__/`, `.mypy_cache/`, `.ruff_cache/`, `.pytest_cache/`
- binary files, images, archives, fonts, and lockfiles except for dependency-consistency checks

Read project entrypoints and configuration first:

- `README.md`, `AGENTS.md`, `docs/`
- `backend/pyproject.toml`, `backend/Dockerfile`, `backend/.env.example`
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/Dockerfile`, `frontend/nginx.conf`
- `docker-compose.yaml`, CI workflows, pre-commit configuration

## 2. Build a review plan

Group the repository by area and review each area in a focused pass:

1. Backend entrypoints, settings, dependency injection, lifecycle, and shutdown.
2. API routes, request/response DTOs, validation, exception mapping, status codes, and auth boundaries.
3. Application services and use cases: transaction boundaries, error propagation, idempotency, concurrency.
4. Domain and infrastructure code: database sessions, repositories, retries, resource cleanup, external calls.
5. Frontend API layer, auth/session handling, state updates, error handling, and frontend/backend contract alignment.
6. Docker, Compose, Nginx, ports, volumes, environment variables, and health checks.
7. CI, pre-commit hooks, test configuration, and lint/type-check enforcement.
8. Documentation claims that contradict actual code or runtime configuration.

For each area, read the relevant files rather than guessing from filenames. Use broad searches to find risky patterns, then confirm each candidate by reading the surrounding code.

Useful search targets:

- swallowed errors: `except Exception`, bare `except`, `pass`, `TODO`, `FIXME`
- unsafe execution: `eval(`, `exec(`, `shell=True`, `os.system`, `pickle.load`
- secrets and credentials: hardcoded tokens, passwords, private keys, committed `.env` values
- async problems: missing `await`, blocking calls in async functions, unmanaged tasks
- database problems: sessions not closed, missing rollback, long transactions, unsafe retries
- API contract mismatches: base URLs, `/api/v1` prefixes, ports, payload fields, status codes
- security: permissive CORS, unsafe logging, path traversal, missing authorization checks
- configuration drift: paths and ports that disagree across Docker, frontend, backend, and docs

Do not report every match. Report only issues confirmed by reading the code and understanding the impact.

## 3. Run available checks

Run local checks when the tools and dependencies are already available. Do not install packages or start long-running services just for this audit.

Backend:

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy src
```

Frontend:

```bash
cd frontend && npm run typecheck
```

Configuration:

```bash
docker compose config
```

Run the project test suite only when a documented test command exists and dependencies are present. Record every command, its result, and failures in the report.

## 4. Write the report

Write the report to the repository root as:

```text
project-bug-report.md
```

Overwrite any previous report. Use this structure:

```markdown
# Project Bug Report

- Generated: <ISO date>
- Branch: <current branch>
- Scope: <number of files reviewed and main areas covered>
- Checks: <commands and results, or "not run">

## Summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

| Area | Findings |
| --- | --- |
| Backend | 0 |
| Frontend | 0 |
| API contract | 0 |
| Docker/configuration | 0 |
| Security | 0 |
| Tests/CI | 0 |

## Findings

### 1. [High] Short actionable title

- File: `path/to/file.ext:line`
- Area: Backend | Frontend | API contract | Docker/configuration | Security | Tests/CI
- Category: Bug | Syntax | Runtime | Error handling | Security | Refactor | Configuration
- Evidence: What the code currently does.
- Impact: What can fail, for whom, and under which conditions.
- Suggested fix: A concrete change, with a short code sketch when useful.

## Refactoring Opportunities

- `path/to/file.ext:line` - What to simplify, deduplicate, decouple, or type more strictly, and why it matters.

## Security Notes

- Confirmed security issues or risky defaults, with file references. Redact secret values.

## Checks Performed

- `<command>` - passed/failed, with a one-line result.

## Areas Reviewed

- List the files, modules, and configuration areas actually reviewed.

## Not Reviewed

- List generated files, untested integrations, runtime behavior, or external systems that were out of scope.

## Limitations

- State uncertainty and anything that requires running the full stack or external services to verify.
```

If no issues are found, still create the report with zero counts and an explicit statement that no confirmed issues were found. Do not invent findings to fill the report.

## Rules

- Review the entire repository, not only branch changes.
- Prioritize concrete, reproducible issues over speculative concerns.
- Tie every finding to a file and line, and explain the failure mode.
- Do not change application code, tests, or configuration during the audit.
- Never include secret values in the report; redact them.
- Do not commit or stage the generated report unless the user explicitly asks.
- Keep the report useful: fewer high-signal findings are better than a long list of style nits.
