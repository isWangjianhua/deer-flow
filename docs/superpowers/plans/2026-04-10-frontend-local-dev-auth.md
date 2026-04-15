# Frontend Local Dev Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the frontend use the BFF-backed chat flow locally without OIDC by supporting a fixed `demo / demo1234` login path against the BFF `local` auth provider.

**Architecture:** Keep OIDC as the default production path, but add a dev-only local auth mode in the frontend. The browser posts credentials to a same-origin frontend auth route, that route exchanges them for a BFF bearer token and stores it in an httpOnly cookie, and existing `/api/bff/*` bridge routes reuse either the local bearer token or the OIDC account token.

**Tech Stack:** Next.js App Router, Better Auth, Next.js route handlers, FastAPI BFF local auth, Node.js `node:test`, pytest.

---

### Task 1: Add local-auth config and cookie helpers

**Files:**
- Create: `frontend/src/core/auth/local.ts`
- Create: `frontend/src/core/auth/local.test.ts`
- Modify: `frontend/src/env.js`
- Modify: `frontend/.env.example`

- [ ] Add failing tests for auth mode and cookie-token extraction.
- [ ] Implement helpers for local auth mode detection and bearer cookie names.
- [ ] Wire the required env fields.

### Task 2: Add same-origin frontend local login/logout routes

**Files:**
- Create: `frontend/src/app/api/auth/local/login/route.ts`
- Create: `frontend/src/app/api/auth/local/logout/route.ts`
- Modify: `frontend/src/core/auth/browser.ts`

- [ ] Add failing tests for login request/response shaping where practical.
- [ ] Implement login route that calls BFF `/auth/login`, writes httpOnly cookie, and returns a synthetic frontend session payload.
- [ ] Implement logout route that clears the cookie and local session marker.
- [ ] Extend browser auth helpers to support local dev mode.

### Task 3: Reuse local bearer token in `/api/bff/*` routes

**Files:**
- Modify: `frontend/src/app/api/bff/me/route.ts`
- Modify: `frontend/src/app/api/bff/conversations/route.ts`
- Modify: `frontend/src/app/api/bff/conversations/[conversation_id]/route.ts`
- Modify: `frontend/src/app/api/bff/conversations/[conversation_id]/messages/stream/route.ts`

- [ ] Add a shared auth resolver that prefers local bearer cookie in local-dev mode and falls back to OIDC session/token.
- [ ] Update all BFF bridge routes to use the shared auth resolver.
- [ ] Verify unauthenticated behavior still returns stable `401` errors.

### Task 4: Add minimal local login UI and docs

**Files:**
- Modify: `frontend/src/components/auth/login-button.tsx`
- Modify: `frontend/src/components/auth/auth-status-card.tsx`
- Modify: `frontend/README.md`

- [ ] Add demo credential login form for local auth mode.
- [ ] Keep OIDC button for non-local mode.
- [ ] Document the local-dev auth setup and startup steps.
