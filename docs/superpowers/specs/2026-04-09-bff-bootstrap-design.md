# BFF Bootstrap Design

## Overview

This spec defines the first implementation slice of a standalone FastAPI BFF service for DeerFlow.

The BFF sits between the frontend and DeerFlow Gateway. Its purpose is to establish a stable frontend-facing API boundary while keeping DeerFlow Gateway as an internal agent runtime.

The first implementation slice is intentionally narrow:

- local simplified login with JWT
- SQLite-backed persistence
- conversation creation
- conversation listing
- SSE chat proxying

The following capabilities are explicitly deferred:

- upload proxy
- artifact proxy
- conversation deletion
- external identity provider integration
- PostgreSQL migration
- subscription, quota, and billing logic

## Goals

- Make the frontend talk only to the BFF, not DeerFlow Gateway directly.
- Keep DeerFlow `thread_id` internal to the BFF.
- Establish ownership checks for all conversation-scoped operations.
- Preserve streaming chat UX through SSE proxying.
- Keep the code structure clean enough for future auth, quota, and storage upgrades.

## Non-Goals

- Building a full account system
- Integrating payment or subscription logic
- Supporting admin features
- Reproducing DeerFlow Gateway APIs 1:1
- Implementing all future conversation operations in the first pass

## Architecture

```text
Frontend
  -> BFF (FastAPI)
    -> auth
    -> conversation ownership checks
    -> SSE proxy
    -> DeerFlow Gateway (internal runtime)
```

DeerFlow Gateway remains the runtime responsible for agent execution and thread behavior. The BFF is the trust boundary for frontend requests.

## Public Contract Boundary

The BFF owns the public API contract.

Rules:

- the frontend uses `conversation_id`
- the frontend must never receive DeerFlow `thread_id`
- the BFF may call DeerFlow APIs internally, but those routes and identifiers are not part of the frontend contract
- errors returned to the frontend must be BFF-defined and normalized

## First-Version Component Design

### `app/core/config.py`

Owns typed settings:

- host and port
- JWT secret and expiration
- SQLite database URL or path
- DeerFlow Gateway base URL
- request timeouts

### `app/core/security.py`

Owns:

- password hashing
- password verification
- JWT creation
- JWT decoding

### `app/db/`

Owns:

- SQLite engine or connection setup
- session factory
- table metadata registration
- future migration hook points

### `app/models/`

First-version persistence models:

- `User`
- `Conversation`

### `app/schemas/`

Owns request and response models for:

- login
- current user
- conversation create
- conversation list item
- stream request envelope
- normalized error response

### `app/repositories/`

Owns persistence operations:

- `user_repo.py`
- `conversation_repo.py`

### `app/services/`

Owns business rules:

- `auth_service.py`
- `conversation_service.py`

Responsibilities:

- authenticate local user login
- resolve current user from JWT
- create conversation mappings
- validate ownership before streaming

### `app/clients/deerflow.py`

Owns all outbound integration with DeerFlow Gateway:

- create or initialize downstream thread
- invoke downstream streaming requests
- normalize transport-level failures into service-usable exceptions

### `app/api/routes/`

First-version route modules:

- `auth.py`
- `users.py`
- `conversations.py`

Route handlers should stay thin and delegate all behavior to services.

## Data Model

### `users`

Fields:

- `id`
- `username`
- `password_hash`
- `status`
- `created_at`

Notes:

- this is local simplified auth only
- the model is expected to change when an external identity provider is introduced

### `conversations`

Fields:

- `id`
- `user_id`
- `deerflow_thread_id`
- `title`
- `status`
- `created_at`
- `updated_at`

Rules:

- `id` is the public `conversation_id`
- `deerflow_thread_id` is internal only
- every conversation belongs to exactly one user

## API Surface

### `POST /auth/login`

Purpose:

- authenticate a local user and return JWT

### `GET /me`

Purpose:

- return current authenticated user profile needed by the frontend

### `POST /conversations`

Purpose:

- create a BFF conversation and associated DeerFlow thread mapping

### `GET /conversations`

Purpose:

- list conversations owned by the current user

### `POST /conversations/{conversation_id}/messages/stream`

Purpose:

- open an SSE stream for a conversation owned by the current user

Rules:

- validate JWT first
- validate conversation ownership second
- look up mapped DeerFlow thread third
- open downstream DeerFlow stream last

## Request Flows

### Login

1. frontend sends username and password to BFF
2. BFF verifies local credentials
3. BFF signs a JWT
4. BFF returns token and basic user payload

### Conversation creation

1. frontend sends authenticated request to create a conversation
2. BFF resolves current user
3. BFF creates a downstream DeerFlow thread if needed
4. BFF writes a mapping row with public `conversation_id`
5. BFF returns conversation metadata without exposing DeerFlow thread state

### SSE chat flow

1. frontend calls BFF stream endpoint with `conversation_id`
2. BFF authenticates request
3. BFF validates that the conversation belongs to the current user
4. BFF reads the mapped DeerFlow `thread_id`
5. BFF opens a downstream SSE request to DeerFlow Gateway
6. BFF forwards events incrementally to the frontend

## Error Handling

Rules:

- never expose DeerFlow `thread_id`
- never expose downstream internal URLs
- never expose raw stack traces
- distinguish between not found and forbidden ownership failures
- convert downstream transport failures into stable BFF errors

Expected categories:

- authentication failure
- authorization failure
- conversation not found
- downstream runtime unavailable
- downstream stream terminated unexpectedly

## Testing Strategy

First-version testing should prioritize:

1. auth service login and JWT behavior
2. conversation ownership checks
3. conversation creation behavior
4. DeerFlow client request and failure handling
5. SSE proxy event forwarding
6. route-level auth enforcement

## Future Plan

These items should be called out in planning but not implemented in the first slice:

- upload proxy endpoints
- artifact proxy endpoints
- conversation deletion
- external identity provider integration
- PostgreSQL migration
- quota and entitlement enforcement
- richer audit logging

## Implementation Guidance

Keep the first slice thin in scope but clean in structure.

That means:

- do not overbuild account management
- do not mirror DeerFlow APIs directly
- do build stable BFF-owned schemas
- do keep DeerFlow integration isolated in a client module
- do enforce ownership checks as a first-class rule
