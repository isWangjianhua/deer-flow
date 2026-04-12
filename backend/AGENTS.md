# AGENTS.md

Guidance for coding agents working in `backend/`.

`backend/CLAUDE.md` is the detailed architecture reference for this subtree. Follow it first, then apply the rules below when making changes.

## Service Role

The backend owns two major layers:

- the DeerFlow harness under `packages/harness/deerflow/`
- the Gateway and channel application layer under `app/`

In gateway mode, the runtime is embedded into the Gateway process. In standard mode, LangGraph remains a separate service.

## Hard Boundaries

Agents must preserve these boundaries:

- keep the harness/app dependency direction intact: `app.*` may import `deerflow.*`, but `deerflow.*` must not import `app.*`
- do not move BFF-specific ownership or browser-contract logic into `backend/`
- do not add new browser-facing assumptions that bypass the BFF ownership boundary
- keep runtime `thread_id` handling internal unless an existing backend contract already requires it

## Professional Development Style

- prefer minimal, well-bounded changes over broad rewrites
- preserve the existing harness/app split and directory responsibilities
- keep operational behavior explicit when editing runtime, gateway, sandbox, or config code
- add or update regression tests when behavior changes materially
- treat a feature as complete only when code, tests, and documentation are aligned

## Documentation and Handoff Requirements

Feature work is not complete until the affected documentation is updated.

When a change affects backend behavior, API shape, runtime modes, config, sandbox behavior, thread lifecycle, or operational assumptions, update the relevant documents in the same change. This may include:

- `backend/CLAUDE.md`
- `backend/AGENTS.md`
- relevant `backend/docs/` pages
- relevant root or shared `docs/` pages
- relevant roadmap documents when the change closes, adds, or reorders planned work
- `docs/superpowers/handoffs/*` when the change introduces follow-up work, known gaps, or cross-service integration context

Add a new document when the feature introduces a new subsystem, workflow, or operational rule that is not already documented clearly elsewhere.

## Testing Priority

When backend behavior changes materially, prefer tests in this order:

1. unit or service-level regression tests closest to the changed behavior
2. Gateway API route tests
3. harness boundary tests when import direction or ownership boundaries are at risk
4. runtime, sandbox, or streaming tests when execution behavior changes

## If Unsure

If a change weakens the harness/app split, leaks internal runtime assumptions outward, or makes user-facing flows depend more directly on Gateway internals, it is probably the wrong direction.
