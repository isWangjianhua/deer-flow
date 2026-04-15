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
