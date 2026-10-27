# AGENTS.md

## Git: strict rules

**Without explicit permission from the user, it is forbidden to:**

- create commits (`git commit`, including `--amend` and `--allow-empty`);
- stage changes (`git add`) for the purpose of committing them;
- run `git push`, create or update pull requests;
- create, move, or delete tags;
- rewrite history (`git rebase`, `git reset`, `git revert`, `git cherry-pick`, force-push);
- delete or switch branches.

Permission must be explicit in the user's current request (for example, "make a commit"). Consent given earlier does not apply to subsequent actions.

When anything is ambiguous, ask the user first and wait for an answer.

Reading repository state (`git status`, `git diff`, `git log`, `git show`) is allowed and does not require confirmation.

## Checks

Run linters, formatters, and type checkers automatically without asking for permission (for example, `uv run ruff check`, `uv run ruff format`, `uv run mypy`). Apply safe auto-fixes when appropriate and report unresolved failures.
