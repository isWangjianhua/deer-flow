# BFF Auth Provider Design

## Overview

This spec defines the next auth evolution step for the standalone FastAPI BFF.

The current BFF uses a local demo user and direct JWT issuance inside the auth service. That is sufficient for the bootstrap slice, but it tightly couples authentication flow, current-user resolution, and local user persistence. This design introduces a provider-oriented auth architecture while preserving the current local login path as the default fallback.

The goal is not to integrate a real external auth vendor yet. The goal is to refactor the auth boundary so that external providers can be added later without reworking the BFF API contract or conversation ownership model.

## Goals

- Introduce an auth provider abstraction into the BFF.
- Keep the existing local demo login flow working.
- Add a durable mapping between provider identities and local BFF users.
- Keep `POST /auth/login` and `GET /me` stable for the current frontend.
- Prepare the service for future OIDC or OAuth-based providers without implementing a real vendor integration yet.

## Non-Goals

- Integrating a real external identity vendor
- Changing the frontend login flow
- Adding tenant or permission context
- Replacing local JWT-based session behavior
- Building subscription or entitlement logic

## Recommended Direction

Use a dual-track auth architecture:

- a provider interface that normalizes authentication and identity resolution
- a local provider implementation that preserves current behavior
- an identity mapper that translates provider identities to local BFF users

This keeps the current product usable while moving the design toward a provider-based model.

## Architecture

```text
Frontend
  -> BFF auth routes
    -> AuthService
      -> AuthProvider
      -> IdentityMapper
      -> UserRepository
```

The BFF remains the system of record for conversation ownership and local `User` records. External identities are mapped into local users instead of replacing them.

## First-Version Component Design

### `AuthProvider`

A new interface that abstracts:

- credential authentication
- bearer token identity resolution
- provider metadata

It should return a normalized identity object rather than a provider-specific payload.

### `LocalAuthProvider`

The initial concrete provider.

Responsibilities:

- validate local username and password
- issue BFF JWT through existing security utilities
- decode JWT-backed current identity

This provider preserves the current demo-user-based behavior.

### `IdentityMapper`

A new component that maps provider identities into local users.

Responsibilities:

- find an existing identity link
- create a local user when necessary
- create or update provider identity records

### `AuthService`

Refactor the current auth service so it depends on:

- an auth provider
- an identity mapper

The service should orchestrate the auth flow, but no longer own concrete credential logic itself.

## Data Model Changes

Keep the existing `users` table.

Add a new table:

### `user_identities`

Fields:

- `id`
- `user_id`
- `provider`
- `subject`
- `email`
- `claims_json`
- `created_at`
- `updated_at`

Rules:

- `user_id` references local `users.id`
- `provider + subject` must be unique
- local users remain the only identities referenced by conversations

This allows the BFF to support both local identities and future external identities without changing conversation ownership semantics.

## Public API Impact

The public API should remain stable in this slice.

### `POST /auth/login`

Behavior:

- remains available
- continues to use local login in the first provider-based version

### `GET /me`

Behavior:

- remains available
- returns the local BFF user resolved from provider-backed identity mapping

No new public auth endpoints are required in this slice.

## Internal Auth Flow

### Local login flow

1. frontend calls `POST /auth/login`
2. BFF uses `LocalAuthProvider` to validate credentials
3. provider returns normalized identity data
4. `IdentityMapper` ensures there is a linked local `User`
5. BFF issues or returns the JWT session token

### Current user flow

1. frontend sends bearer token
2. BFF resolves provider identity from the token
3. `IdentityMapper` resolves the linked local user
4. BFF returns local user data through `GET /me`

## Configuration

Add auth provider configuration fields to BFF settings.

Initial fields:

- `BFF_AUTH_PROVIDER=local`
- `BFF_AUTH_FALLBACK_ENABLED=true`

Reserved for future OIDC support:

- `BFF_OIDC_ISSUER`
- `BFF_OIDC_AUDIENCE`
- `BFF_OIDC_JWKS_URL`

These future fields should be present in settings design, but they do not need to be functionally used in this slice.

## Error Handling

Provider-aware auth should standardize these error categories:

- `invalid_credentials`
- `invalid_token`
- `user_not_found`
- `identity_mapping_failed`
- `provider_not_enabled`

Rules:

- keep error payloads BFF-defined
- never leak provider internals
- never leak unfiltered claims or secrets

## Testing Strategy

This slice should cover:

1. `LocalAuthProvider` preserving current behavior
2. `AuthService` working through provider abstraction
3. `IdentityMapper` creating and reusing local users
4. `POST /auth/login` remaining stable
5. `GET /me` remaining stable

Do not expand this slice into:

- real OIDC discovery
- JWKS validation
- browser redirects
- frontend login UI work

## Future Path

Once this structure exists, the next auth steps can be split cleanly:

1. add real OIDC provider implementation
2. support external bearer token validation
3. update frontend login flow when desired
4. add richer user context such as roles or tenant metadata

## Implementation Guidance

Keep this slice focused on internal structure.

That means:

- preserve current working behavior
- avoid changing the public API unless required
- add mapping infrastructure now
- keep provider boundaries explicit
- avoid overbuilding a plugin system before a second provider exists
