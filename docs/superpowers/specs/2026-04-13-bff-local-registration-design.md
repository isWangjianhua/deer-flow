# BFF Local Registration Design

Date: 2026-04-13

## Summary

Add a minimal local registration flow for BFF local-auth mode.

The first version is intentionally narrow:

- local username/password registration only
- no OIDC changes
- no email verification
- no password reset
- no admin approval flow

The new flow should let a user create a local account from `/workspace/account` and land in the same authenticated local session state that login already uses.

## Problem

The repository already supports local login for development:

- BFF exposes `POST /auth/login`
- frontend local-auth mode shows a login form on `/workspace/account`
- BFF seeds a `demo / demo1234` account at startup

That is enough for a single shared demo account, but it is not enough for basic multi-user local testing. New local users cannot self-register, so every test user must be pre-seeded or inserted manually.

## Goals

- Add self-service local registration for username/password in BFF local-auth mode.
- Reuse the current local auth token and cookie flow after successful registration.
- Keep the UI change scoped to the existing `/workspace/account` page.
- Preserve current OIDC behavior without regression.
- Document email verification and password reset as future work rather than first-version scope.

## Non-Goals

- Do not add email verification in this round.
- Do not add password reset or forgot-password flows in this round.
- Do not add email collection to the persisted user model in this round.
- Do not change OIDC provider behavior.
- Do not redesign the account page beyond adding the registration path.
- Do not introduce roles, invitations, or admin approval.

## Current Constraints

The existing local auth model is intentionally small:

- `bff/app/models/user.py` stores `username`, `password_hash`, `status`, and timestamps
- `bff/app/schemas/user.py` does not expose an email field
- frontend local login already proxies through `frontend/src/app/api/auth/local/login/route.ts`

Because the current model has no email field, the first registration slice should not collect or persist email. Email verification and password recovery remain future roadmap work and should be documented as such.

## Chosen Approach

Use a narrow local-registration extension that mirrors the current local-login shape:

1. BFF adds `POST /auth/register` for local mode only.
2. The endpoint creates a new local user after validating username uniqueness and password rules.
3. The endpoint returns the same bearer token response shape as login.
4. Frontend adds a local register bridge route and a login/register mode toggle on `/workspace/account`.
5. On successful registration, frontend writes the same local auth cookie state that local login already uses, so the user lands in a signed-in state immediately.

This keeps registration aligned with the current auth boundary and avoids adding a second session model.

## Alternatives Considered

### Option 1: Register and immediately sign in

Pros:

- best user experience
- reuses the existing local cookie and `/me` fetch flow
- smallest conceptual change for the frontend

Cons:

- registration path must mint a token, not just create a user

### Option 2: Register, then force a separate login

Pros:

- slightly simpler server behavior

Cons:

- worse user experience
- duplicates credential entry
- adds UI steps without improving security in local mode

### Option 3: Keep registration as a manual admin-only step

Pros:

- no UI changes

Cons:

- does not solve the actual need for self-service local test accounts

Option 1 is the chosen approach.

## Backend Design

### API

Add `POST /auth/register` under `bff/app/api/routes/auth.py`.

Request body:

- `username: str`
- `password: str`

Response body:

- same as login: `TokenResponse`

Error cases:

- `400` for invalid input such as empty username or too-short password
- `409` when the username already exists
- `404` when local registration is not available because auth mode is not `local`

### Service behavior

Extend `AuthService` with a registration method that:

1. rejects the call unless the active provider is local auth
2. normalizes and validates the username
3. validates the password against a minimal local policy
4. checks uniqueness through `UserRepository`
5. creates the local user with a hashed password
6. mints an access token using the same token creation path as login

The method should not try to reuse `IdentityMapper`. Registration is a direct local-user creation path, not an external identity resolution flow.

### Validation rules

First version validation should stay simple and explicit:

- username is required
- username is trimmed
- username must be between 3 and 64 characters
- username must be unique
- password is required
- password must be at least 8 characters

If more rules are desired later, they should be introduced as a follow-up, not mixed into the first slice.

### Repository changes

`UserRepository` already supports:

- `get_by_username`
- `create_local_user`

No table migration is required for the first version.

## Frontend Design

### Account page

Update the local-auth section of `frontend/src/components/auth/auth-status-card.tsx` to support two modes:

- `Login`
- `Register`

OIDC mode remains unchanged and must not render the registration controls.

### Register bridge route

Add `frontend/src/app/api/auth/local/register/route.ts`.

This route should mirror the existing login bridge:

1. reject when local dev auth mode is disabled
2. forward credentials to `BFF /auth/register`
3. call `BFF /me` with the returned bearer token
4. write the same local auth cookies used by login
5. return the same local session payload shape used by login

### UI behavior

Register mode should include:

- username
- password
- confirm password

Client-side checks should stay narrow:

- required fields
- password and confirm password must match

Server responses should drive final error messages for uniqueness and validation failures.

After successful registration:

- the page should transition into the authenticated local state
- the user should see the same signed-in account status cards used after login

## Error Handling

Backend error responses should stay structured and machine-readable.

Expected user-visible failures:

- username already exists
- password too short
- invalid username
- local registration disabled in non-local auth mode
- unexpected BFF failure while fetching `/me` after token issuance

Frontend should surface these as inline form errors without replacing the rest of the account page.

## Testing

### BFF tests

Add coverage for:

- successful registration returns a bearer token
- duplicate username returns `409`
- invalid payload returns `400`
- registration is unavailable outside local auth mode

### Frontend tests

Add coverage for:

- local mode shows login/register toggle
- register mode posts to the local register route
- successful registration sets signed-in local state
- password mismatch is blocked client-side
- server-side errors render inline

## Documentation

Update:

- `bff/README.md`
- `bff/docs/DEVELOPMENT.md`
- `bff/docs/ROADMAP.md`
- `frontend/README.md`

Documentation should explicitly state:

- local registration exists only for local auth mode
- first version supports username/password only
- email verification and password reset are future work

## Future Work

These items are intentionally deferred:

- email field on local users
- email verification
- forgot-password and password-reset flows
- stronger password policy and rate limiting
- admin-managed user lifecycle
- broader auth hardening for production local-user deployments

If local user accounts become more than a development convenience, those items should be addressed before positioning the flow as production-ready.
