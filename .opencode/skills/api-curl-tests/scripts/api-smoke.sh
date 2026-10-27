#!/usr/bin/env bash
set -u

BASE_URL="${API_BASE_URL:-http://localhost:8080/api/v1}"
TIMEOUT="${API_TIMEOUT:-5}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

passed=0
failed=0

if [[ $# -eq 0 ]]; then
  set -- GET /health/live 200 GET /health/ready 200
fi

if [[ $(( $# % 3 )) -ne 0 ]]; then
  echo "Usage: $0 [METHOD PATH EXPECTED_STATUS]..." >&2
  exit 2
fi

while [[ $# -gt 0 ]]; do
  method="$1"
  path="$2"
  expected="$3"
  shift 3

  body_file="$(mktemp)"
  headers=()
  if [[ -n "$AUTH_TOKEN" ]]; then
    headers=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  status="$(curl -sS --max-time "$TIMEOUT" \
    -X "$method" \
    "${headers[@]}" \
    -o "$body_file" \
    -w '%{http_code}' \
    "${BASE_URL}${path}" 2>/dev/null)" || status="000"

  if [[ "$status" == "$expected" ]]; then
    printf 'PASS %s %s -> %s\n' "$method" "$path" "$status"
    passed=$((passed + 1))
  else
    printf 'FAIL %s %s -> %s (expected %s)\n' "$method" "$path" "$status" "$expected"
    if [[ -s "$body_file" ]]; then
      printf '  body: '
      tr -d '\n' < "$body_file"
      printf '\n'
    fi
    failed=$((failed + 1))
  fi

  rm -f "$body_file"
done

printf '%d passed, %d failed\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
