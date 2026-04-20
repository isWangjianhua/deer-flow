# BFF Roadmap

This roadmap is intentionally short and reflects the current state of the fork
rather than the original first-slice plan.

## Already Landed

The main BFF-backed product path now includes:

- browser account/session flow
- local auth plus local self-registration
- OIDC bearer-token validation in the BFF
- BFF-owned conversation create/list/detail/stream
- BFF-backed model discovery
- BFF-backed artifact, suggestion, and upload routes for the main chat path
- same-origin frontend bridge routes that hide the internal BFF base URL from
  browser code

## Next High-Value Gaps

### 1. Conversation lifecycle completion

Still missing from the public BFF contract:

- rename
- delete
- archive or soft-delete policy

### 2. Stronger local-auth product features

Still intentionally deferred:

- email verification
- password reset
- stronger password policy

### 3. Governance and limits

The BFF is the right place for:

- rate limiting
- per-user concurrency limits
- usage accounting hooks
- richer audit logging

### 4. Decide long-term ownership of non-chat same-origin APIs

The main open architecture question is whether these stay as frontend bridge
routes or move fully into the BFF:

- MCP
- skills
- agents

## Current Recommendation

Keep the BFF focused on the user-critical chat and account boundary first.
Avoid turning it into a generic reverse proxy for every gateway route.
