# Fork Sync Workflow

This fork follows a long-lived downstream workflow:

- `upstream/main` is the original ByteDance DeerFlow branch.
- `main` mirrors `upstream/main` and should stay upstream-only.
- `master` is the stable branch for this fork's productized changes.
- `feat/*` branches carry feature work and merge back into `master`.
- `sync/upstream-YYYY-MM-DD` branches are short-lived integration branches used to bring upstream changes into `master` safely.

## Branch Responsibilities

| Branch | Role | Allowed changes |
| --- | --- | --- |
| `upstream/main` | Upstream source of truth | Never commit directly |
| `main` | Local mirror of upstream | Fast-forward syncs from `upstream/main` only |
| `master` | Stable downstream branch | Reviewed product changes and approved upstream sync PRs |
| `feat/*` | Feature and fix branches | Scoped work branched from `master` |
| `sync/upstream-*` | Throw-away integration branch | Upstream merge, conflict resolution, verification |

Rules:

- Do not put fork-specific work on `main`.
- Do not rebase shared `master` history.
- Do not merge `main` into every feature branch by habit; only do it when a feature is blocked by upstream API changes.
- Delete `sync/upstream-*` branches after the upstream sync lands or is abandoned.

## Standard Upstream Sync Procedure

Use a short-lived sync branch every time you import upstream changes into `master`.

1. Update the upstream mirror branch:

   ```bash
   git fetch upstream --prune
   git switch main
   git merge --ff-only upstream/main
   git push origin main
   ```

2. Create a throw-away integration branch from `master`:

   ```bash
   git switch master
   git pull --ff-only origin master
   git switch -c sync/upstream-2026-04-15
   ```

3. Merge the upstream mirror into the sync branch:

   ```bash
   git merge --no-ff main
   ```

4. Resolve conflicts, run the relevant checks, and inspect the merged result.

5. Push the sync branch and open a pull request into `master`:

   ```bash
   git push -u origin sync/upstream-2026-04-15
   ```

6. Merge the PR only after validation passes. If the merge proves too disruptive, close the PR and delete the sync branch. `master` stays untouched.

This pattern matches Git's recommended use of throw-away integration branches for testing how long-lived topics interact before the stable branch is updated.

## Current Conservative Sync Procedure

This fork has diverged from upstream in the frontend and BFF layers. Do not treat a full `main -> master` merge as the default path. The safer default is a path-scoped sync that imports upstream backend changes first and handles frontend changes only as targeted bug fixes.

Use this procedure when the goal is to absorb upstream work while preserving this fork's product behavior.

1. Recreate a clean sync worktree from `master`:

   ```bash
   git worktree remove --force .worktrees/sync-upstream-2026-04-15
   git branch -D sync/upstream-2026-04-15
   git worktree add .worktrees/sync-upstream-2026-04-15 -b sync/upstream-2026-04-15 master
   ```

2. Copy local development env files into the new worktree before running the app:

   ```bash
   cp frontend/.env.local .worktrees/sync-upstream-2026-04-15/frontend/.env.local
   cp bff/.env .worktrees/sync-upstream-2026-04-15/bff/.env
   ```

   Worktrees only copy tracked files. Local files such as `frontend/.env.local`, `bff/.env`, `.env`, and `config.yaml` are usually ignored by Git, so a new worktree will not automatically match the runtime behavior of the main checkout.

3. Import only upstream backend changes:

   ```bash
   cd .worktrees/sync-upstream-2026-04-15
   git restore --source=main --staged --worktree -- backend
   git diff --cached --check -- backend
   ```

4. Run focused backend checks before committing:

   ```bash
   cd backend
   uv run pytest tests/test_lead_agent_model_resolution.py tests/test_lead_agent_prompt.py tests/test_memory_queue.py
   ```

5. Commit the backend sync separately:

   ```bash
   git commit -m "sync: bring backend from main" -- backend
   ```

6. Treat frontend fixes as separate commits. If the backend sync exposes frontend symptoms, first determine whether the issue is caused by this fork's frontend architecture, then fix only the affected files.

   Example fixes from the 2026-04-15 sync:

   ```text
   fix: clear chat input after submit
   fix: handle missing clipboard api
   ```

7. Merge the sync branch back to `master` only after the sync branch is clean:

   ```bash
   git switch master
   git merge --ff-only sync/upstream-2026-04-15
   ```

This approach intentionally avoids importing upstream frontend wholesale. It keeps backend sync reviewable and prevents upstream frontend deletions or route changes from breaking this fork's BFF-backed chat and local auth flow.

## Frontend Sync Policy

The frontend in this fork is not a thin copy of upstream. It includes fork-owned product behavior that upstream `main` may not have:

- BFF-backed chat routes under `frontend/src/app/api/bff/*`.
- Local/OIDC auth flows under `frontend/src/core/auth/*` and `frontend/src/components/auth/*`.
- Account UI under `frontend/src/app/workspace/account`.
- BFF chat state under `frontend/src/core/bff-chat/*`.
- Fork-specific chat page behavior under `frontend/src/components/workspace/chats/*`.

For that reason:

- Do not run `git restore --source=main -- frontend` as part of routine sync.
- Do not resolve frontend conflicts by blindly taking `main`.
- Use `main` frontend as a reference implementation, not as the default source of truth.
- Prefer small, isolated frontend fixes with their own commits and tests.
- Be extra careful with `auth/`, `api/bff/`, `core/bff-chat/`, and `workspace/chats/`; these are high-risk fork-owned paths.

Safer frontend candidates to compare against upstream first:

- Shared UI primitives under `frontend/src/components/ai-elements/`.
- Message rendering helpers under `frontend/src/components/workspace/messages/`.
- Artifact display components under `frontend/src/components/workspace/artifacts/`.

Even for those paths, import changes in small chunks and re-run the chat/auth/artifact flows before committing.

## Manual Validation Checklist

After any sync branch changes, validate the product flows that matter for this fork:

- Local login dialog opens in local auth mode, not OIDC mode.
- Account page loads and `/api/bff/me` returns `200`.
- New chat can create a BFF conversation.
- Input clears immediately after send, while streaming continues.
- Recent chats update after a new conversation.
- Suggestions endpoint returns `200` after stream completion.
- Artifact markdown/html files load through the BFF artifact routes.
- Copy buttons do not crash when `navigator.clipboard` is unavailable.

Useful focused checks:

```bash
cd backend
uv run pytest tests/test_lead_agent_model_resolution.py tests/test_lead_agent_prompt.py tests/test_memory_queue.py

cd ../frontend
node src/components/workspace/chats/chat-auth-gate.boundary.test.ts
node src/core/clipboard.test.ts
pnpm exec eslint src/components/auth/use-login-required-submit.ts src/components/workspace/chats/chat-page.tsx src/components/workspace/copy-button.tsx src/core/clipboard.ts src/core/clipboard.test.ts
```

`pnpm exec tsc --noEmit` should still be run when practical, but if it fails, identify whether the failure is from the current sync or an existing unrelated test/type issue before blocking the sync.

## Feature Branch Workflow

Feature work should continue to branch from `master`, not from `main`.

```bash
git switch master
git pull --ff-only origin master
git switch -c feat/your-feature-name
```

When the feature is ready:

```bash
git push -u origin feat/your-feature-name
```

Open a PR from `feat/your-feature-name` into `master`.

## Pull Request Rules

- Use `master` as the base branch for all fork-owned product work.
- Use `sync/upstream-* -> master` PRs for upstream imports.
- Use `feat/* -> master` PRs for feature and fix work.
- Keep upstream sync PRs separate from feature work so conflict resolution stays reviewable.
- If an upstream sync requires manual conflict decisions, summarize the decision in the PR description.
- Prefer merging upstream frequently instead of batching many weeks of drift into one sync.

## Recommended Local Git Settings

Enable `rerere` so Git can reuse repeated conflict resolutions across long-lived branches:

```bash
git config rerere.enabled true
```

Optional aliases:

```bash
git config alias.sync-main '!git fetch upstream --prune && git switch main && git merge --ff-only upstream/main'
git config alias.sync-branch '!f(){ git switch master && git pull --ff-only origin master && git switch -c sync/upstream-$1; }; f'
```

Example:

```bash
git sync-main
git sync-branch 2026-04-15
git merge --no-ff main
```

Adjust alias naming or shell syntax if your local environment requires it.

## Operational Notes

- The fork's default branch should match the branch reviewers treat as stable. If `master` is the protected product branch, configure repository defaults and branch protections accordingly.
- Review current CI triggers before relying on push-based checks. PR validation is the most important safety net for this workflow.
- If a specific upstream change is needed urgently and a full sync would be too disruptive, selectively `cherry-pick` that change into a topic branch and document why.
