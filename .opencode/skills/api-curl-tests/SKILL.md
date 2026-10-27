---
name: api-curl-tests
description: Run AgentDesk API smoke tests with curl and report pass/fail results. Use when the user asks to test API endpoints, run API smoke tests, verify backend health, or exercise routes with curl.
---

# API Curl Tests

Use this skill to verify the AgentDesk API with `curl` and report clear pass/fail results.

## Defaults

- Base URL: `http://localhost:8080/api/v1`
- Health endpoints: `GET /health/live`, `GET /health/ready`
- Override the base URL with `API_BASE_URL`.
- Override the request timeout with `API_TIMEOUT` (seconds, default `5`).
- Set `AUTH_TOKEN` to send `Authorization: Bearer <token>`.

## Workflow

1. Confirm the API is running:

   ```bash
   curl -sS --max-time "${API_TIMEOUT:-5}" \
     -o /dev/null -w '%{http_code}\n' \
     "${API_BASE_URL:-http://localhost:8080/api/v1}/health/live"
   ```

   If the request fails, report that the API is unreachable and tell the user how to start it. Do not start services without permission.

2. Run the default health smoke tests:

   ```bash
   bash .opencode/skills/api-curl-tests/scripts/api-smoke.sh
   ```

3. Run additional endpoint checks by passing `METHOD PATH EXPECTED_STATUS` triplets:

   ```bash
   bash .opencode/skills/api-curl-tests/scripts/api-smoke.sh \
     GET /health/live 200 \
     GET /health/ready 200 \
     GET /workflows 200
   ```

4. For requests that need JSON bodies, headers, or auth, use `curl` directly:

   ```bash
   curl -sS --max-time "${API_TIMEOUT:-5}" \
     -X POST \
     -H 'Content-Type: application/json' \
     -H "Authorization: Bearer ${AUTH_TOKEN}" \
     -d '{"name":"smoke-test"}' \
     -o /tmp/agentdesk-response.json \
     -w '%{http_code}\n' \
     "${API_BASE_URL:-http://localhost:8080/api/v1}/workflows"
   ```

5. Report results as `PASS` or `FAIL` per endpoint. On failure, include the HTTP status and response body. Finish with a one-line summary such as `4 passed, 1 failed`.

## Rules

- Always use `-sS` and `--max-time` so failures are visible and requests cannot hang.
- Capture the response body and HTTP status separately with `-o` and `-w`.
- Treat any status other than the expected status as a failure.
- Do not silently accept `4xx` or `5xx` responses.
- Do not modify application code or commit changes unless the user asks.
