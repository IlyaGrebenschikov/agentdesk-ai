---
name: branch-bug-review
description: Review only the current branch changes for bugs, syntax errors, runtime risks, security issues, and refactoring opportunities, then write a branch-named bug-fixes Markdown report at the repository root. Use when the user asks to review current branch changes, audit a branch diff, find bugs in the current branch, or generate a bug fixes report.
---

# Branch Bug Review

Review the changes introduced by the current branch only. Produce a concise, actionable Markdown report at the repository root. Do not modify application code, stage files, or commit anything unless the user explicitly asks.

## 1. Determine the review scope

Find the current branch:

```bash
BRANCH="$(git branch --show-current)"
```

Determine the base branch without fetching:

```bash
BASE="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"

if [ -z "$BASE" ]; then
  for candidate in main master; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      BASE="$candidate"
      break
    fi
  done
fi
```

If the base branch still cannot be determined, or the current branch is the base branch itself, review the uncommitted working tree changes instead and state that in the report.

Collect the branch-only changes:

```bash
git log --oneline "$BASE"..HEAD
git diff --stat "$BASE"...HEAD
git diff --name-status "$BASE"...HEAD
git diff "$BASE"...HEAD
```

Also include uncommitted changes, because they are part of the current working branch:

```bash
git diff --stat HEAD
git diff --name-status HEAD
git diff HEAD
git ls-files --others --exclude-standard
```

If both the branch diff and the working tree are empty, write a report that says there are no changes to review and stop.

## 2. Review the changed code

Analyze only changed files and the lines they touch. Read enough surrounding context in each file to understand the change. Prefer `git diff -U80 "$BASE"...HEAD -- <path>` or read the full file when the diff is not self-explanatory.

Ignore generated or dependency files unless they affect correctness:

- `node_modules/`, `.venv/`, `dist/`, build output
- cache directories such as `__pycache__/`, `.mypy_cache/`, `.ruff_cache/`
- large lockfile diffs unless dependency or lockfile consistency is the point of the change

Look for:

- Syntax, import, type, and configuration errors.
- Runtime bugs: wrong conditionals, missing `await`, incorrect async usage, resource leaks, unclosed files/sessions, missing cleanup.
- Broken error handling: unhandled exceptions, swallowed errors, incorrect status codes, missing rollback, misleading messages.
- API contract mismatches between frontend and backend: paths, prefixes, ports, payload shapes, status codes, auth headers.
- Docker and environment issues: wrong paths, mount targets, volumes, ports, missing env vars, health checks that cannot work.
- Data and state bugs: race conditions, non-idempotent retries, lost updates, invalid state transitions.
- Security issues: committed secrets, credential leaks, unsafe logging, injection risks, path traversal, permissive CORS outside local development.
- Tests and validation gaps introduced by the change.
- Refactoring opportunities that reduce duplication, complexity, or coupling.

Do not report style-only nits unless they create a concrete maintenance or correctness risk. Avoid speculative findings without evidence from the diff or surrounding code.

## 3. Run available checks

Run relevant local checks when the tools and dependencies are already available. Do not install packages or start long-running services just for this review.

Backend, when `backend/pyproject.toml` changed or backend code changed:

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy src
```

Frontend, when frontend code or configuration changed:

```bash
cd frontend && npm run typecheck
```

Run tests only when a test command is documented and the dependencies are present. Record which checks were run, which passed, and which failed in the report.

## 4. Write the report

Convert the branch name into a safe filename by replacing `/`, `\`, and whitespace with `-`:

```bash
REPORT="$(printf '%s' "$BRANCH" | sed 's#[/\\[:space:]]#-#g')-bug-fixes.md"
```

When reviewing the base branch or detached HEAD, use `working-tree` as the name:

```bash
REPORT="working-tree-bug-fixes.md"
```

Write the report to the repository root and overwrite any previous report for the same branch.

Use this structure:

```markdown
# Bug Review: <branch>

- Generated: <ISO date>
- Base branch: <base branch and merge-base SHA>
- Scope: <committed files/lines> plus <uncommitted files/lines>
- Checks: <commands and results, or "not run">

## Summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

## Findings

### 1. [High] Short actionable title

- File: `path/to/file.ext:line`
- Category: Bug | Syntax | Error handling | API contract | Docker/configuration | Security | Refactor
- Evidence: What the changed code does and why it is risky.
- Impact: What can break, for whom, and under which conditions.
- Suggested fix: A concrete change, with a short code sketch when useful.

## Refactoring Opportunities

- `path/to/file.ext:line` - What to simplify, deduplicate, or decouple, and why.

## Checks Performed

- `<command>` - passed/failed, with a one-line result.

## No Issues Found

Use this section only when there are no findings, and list what was reviewed.

## Limitations

- Files or behaviors that were not reviewed, and why.
```

If no findings exist, still create the report with the summary table at zero and an explicit "No issues found" section.

## Rules

- Review only the current branch delta and its working tree. Do not inspect unrelated branches or rewrite history.
- Never print, copy, or include secret values in the report. Redact them.
- Do not change application code or tests during the review.
- Do not commit or stage the generated report unless the user explicitly asks.
- Keep findings concrete and tied to changed lines. Prefer fewer high-signal findings over a long list of guesses.
