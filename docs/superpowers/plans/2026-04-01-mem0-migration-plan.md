# Mem0 Migration Plan

## Goal

Replace global file-based long-term memory with user-scoped mem0 while keeping the current product usable:

- Agent memory becomes user-scoped via `user_id`
- Prompt injection uses mem0 retrieval instead of `memory.json`
- Gateway `/api/memory` remains available for the current frontend
- Existing frontend settings page continues to work with a compatibility payload

## Scope

### In scope

- Add a mem0-backed memory service
- Route memory updates through mem0 using `user_id` and `thread_id`
- Inject retrieved memories into the agent prompt
- Require auth on Gateway memory routes and scope all operations to the current user
- Preserve the current `MemoryResponse` shape with empty summary sections and mem0 facts
- Add tests for user scoping, API behavior, and prompt injection compatibility

### Out of scope

- Full summary-section regeneration in mem0
- Migrating old `memory.json` data automatically
- Reworking the frontend memory settings UI beyond compatibility fixes

## Design

### 1. Introduce a mem0 service layer

Add a dedicated backend abstraction that hides mem0 SDK details:

- `deerflow.agents.memory.mem0_service`

Responsibilities:

- lazy-create mem0 client / store from config
- `search(query, user_id, limit)`
- `add(messages, user_id, run_id, metadata)`
- `get_all(user_id)`
- `delete(memory_id, user_id)`
- `delete_all(user_id)`

User scope:

- use authenticated Gateway `user.id`
- use `thread_id` as `run_id`

### 2. Keep a compatibility memory payload

The existing frontend expects:

- `user.workContext`
- `history.recentMonths`
- `facts[]`

To avoid breaking the UI immediately:

- return empty summary sections
- map mem0 results into `facts[]`
- keep `lastUpdated` based on latest memory timestamp when available

### 3. Replace prompt injection source

Current lead-agent prompt loads global memory data.

Change it to:

- detect `user_id` from runtime/configurable context
- retrieve top relevant memories from mem0
- format those memories into the `<memory>` block

This removes dependence on global `memory.json`.

### 4. Replace memory updates

Current `MemoryMiddleware` queues conversation and `MemoryUpdater` writes a JSON file.

Change it to:

- queue `user_id` together with `thread_id`
- send filtered conversation to mem0
- stop generating and persisting summary JSON

### 5. Scope Gateway memory routes to current user

Current `/api/memory` is global.

Change it to:

- require authenticated user
- read/write only that user's mem0 memories
- keep export/import compatibility where practical

Import strategy for phase 1:

- import only `facts[]` into mem0
- ignore summary sections

## Task Breakdown

### Task 1

Add mem0 dependency and config surface.

### Task 2

Implement mem0 service and unit tests.

### Task 3

Switch prompt injection and middleware/update path to mem0.

### Task 4

Update Gateway memory router to use authenticated user-scoped mem0 data.

### Task 5

Adjust frontend memory compatibility only if backend contract changes require it.

### Task 6

Run targeted backend tests and frontend type/lint verification.

## Verification

- backend memory router tests
- backend prompt/memory tests
- auth + memory scoping tests
- `pnpm typecheck`
- `pnpm lint`
