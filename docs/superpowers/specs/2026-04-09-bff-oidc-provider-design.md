# BFF OIDC Provider Design

## Overview

This spec defines the first real OIDC integration step for the standalone FastAPI BFF.

The current BFF already has a provider-oriented auth structure, but only the local demo provider is functional. This slice adds a real OIDC-backed provider that can validate bearer `id_token` values and map the resulting external identity into the BFF's local user model.

This slice is intentionally backend-only. It does not introduce browser redirects, callback handling, frontend login UI changes, refresh token support, or logout flows.

## Goals

- Add a real `OidcAuthProvider` to the BFF.
- Validate bearer `id_token` values using OIDC issuer and JWKS configuration.
- Resolve validated OIDC identities into local BFF users through the existing identity mapping layer.
- Keep the existing BFF resource model and conversation ownership rules unchanged.
- Preserve the local provider path for local development and fallback scenarios.

## Non-Goals

- Browser redirect or callback-based login flows
- Frontend OIDC login UI
- Refresh token handling
- Logout propagation to the identity provider
- Multiple OIDC providers in the same slice
- Replacing BFF-owned local users with external identities directly

## Recommended Direction

Use the existing provider-oriented auth structure and add one new provider implementation:

- `LocalAuthProvider` remains the default development-friendly provider
- `OidcAuthProvider` becomes the first real external provider
- `IdentityMapper` continues to translate provider identities into local BFF users
- `AuthService` switches provider selection based on configuration instead of hardcoding local auth

This keeps the current internal architecture coherent and avoids collapsing provider logic back into the service layer.

## Architecture

```text
Client
  -> Authorization: Bearer <token>
    -> BFF auth dependency / service
      -> configured AuthProvider
        -> OidcAuthProvider (oidc mode)
        -> LocalAuthProvider (local mode)
      -> IdentityMapper
      -> Local User
```

The BFF remains the system of record for:

- local user records
- conversation ownership
- public API contracts

The OIDC provider only supplies external identity proof. It does not become the persistence model for downstream authorization.

## First-Version Component Design

### `OidcAuthProvider`

A new provider implementation responsible for:

- parsing bearer `id_token`
- loading and using JWKS data
- validating token signature
- validating `iss`
- validating `aud`
- validating `exp`
- extracting `sub`
- optionally extracting `email` and other useful claims

It should return a normalized `AuthIdentity` object:

- `provider="oidc"`
- `subject=<sub claim>`
- `email=<email claim or none>`
- `claims=<normalized claims subset>`

### `AuthService`

Refactor provider selection so the service no longer hardcodes `LocalAuthProvider`.

Behavior:

- in `local` mode, current behavior remains active
- in `oidc` mode, bearer tokens are resolved through `OidcAuthProvider`
- local login stays available only for the local provider path

This slice should not add a complex plugin registry. A small provider factory or configuration-based selector is sufficient.

### `IdentityMapper`

No major behavioral change is required.

It should continue to:

- map `provider + subject` to a local user
- create the mapping when missing
- reuse the existing local user when appropriate

OIDC identities should therefore flow into the existing `user_identities` model without changing conversation ownership semantics.

## Public API Impact

The public API remains mostly stable.

### `POST /auth/login`

Behavior:

- remains available for `local` mode
- is not used for OIDC authentication in this slice

If the BFF is configured for OIDC-only auth, the route may reject local login with a stable BFF error such as `provider_not_enabled`.

### `GET /me`

Behavior:

- remains available
- resolves the authenticated user through the configured provider path
- still returns local BFF user data

### Other authenticated routes

Routes such as:

- `POST /conversations`
- `GET /conversations`
- `POST /conversations/{conversation_id}/messages/stream`

should continue to work against the local BFF user resolved from the authenticated OIDC identity.

## Request Flow

### Local mode

1. client calls `POST /auth/login`
2. BFF validates local credentials
3. BFF issues BFF JWT
4. later requests resolve the current local user from that BFF token

### OIDC mode

1. client sends `Authorization: Bearer <id_token>`
2. BFF uses `OidcAuthProvider` to validate the token
3. provider returns normalized `AuthIdentity`
4. `IdentityMapper` resolves or creates the linked local user
5. BFF serves the request using the local user context

This slice assumes the client obtains the OIDC token externally. Token acquisition itself is out of scope.

## Configuration

The following fields are active in this slice:

- `BFF_AUTH_PROVIDER=local|oidc`
- `BFF_AUTH_FALLBACK_ENABLED=true|false`
- `BFF_OIDC_ISSUER=<issuer URL>`
- `BFF_OIDC_AUDIENCE=<audience>`
- `BFF_OIDC_JWKS_URL=<jwks URL>`

Rules:

- `local` mode does not require OIDC settings
- `oidc` mode requires issuer, audience, and JWKS configuration
- missing required OIDC settings should fail as a BFF configuration error

## Token Validation Rules

The first OIDC slice must validate:

- token signature using JWKS
- `iss` equals configured issuer
- `aud` contains or matches configured audience
- `exp` is not expired
- `sub` exists and is non-empty

It may also read:

- `email`
- `name`

These claims can be stored in normalized form in `AuthIdentity.claims` for mapping and debugging purposes, but raw token internals should not be leaked to API clients.

## Error Handling

Add or standardize these auth errors:

- `invalid_token`
- `provider_not_enabled`
- `oidc_configuration_error`
- `identity_mapping_failed`

Rules:

- keep error payloads BFF-defined
- never leak raw JWKS responses, secrets, or stack traces
- never expose provider implementation details unnecessarily

## Testing Strategy

This slice should cover:

1. `OidcAuthProvider` accepts a valid token
2. invalid issuer is rejected
3. invalid audience is rejected
4. expired token is rejected
5. missing subject is rejected
6. `AuthService` selects the configured provider path
7. local provider behavior does not regress
8. `GET /me` works in OIDC mode and still returns a local BFF user

Tests should prefer deterministic local fixtures or mocked JWKS/token validation boundaries rather than relying on a live identity provider.

## Future Path

Once this slice exists, the next auth steps can be cleanly split:

1. frontend obtains OIDC tokens
2. BFF supports callback/redirect login if desired
3. refresh token workflows are introduced
4. logout semantics are added
5. multiple external providers are considered if needed

## Implementation Guidance

Keep this slice focused on provider-backed backend identity validation.

That means:

- do not implement browser auth flows
- do not add unnecessary auth UI contracts
- do not overbuild a provider registry
- keep local development behavior available
- preserve BFF-owned user and conversation semantics
