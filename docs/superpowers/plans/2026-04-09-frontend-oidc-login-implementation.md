# Frontend OIDC Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-based OIDC login to the existing `frontend` app through `better-auth`, expose a reusable `frontend/src/core/auth/` boundary, and prove the first authenticated frontend-to-BFF `/me` flow.

**Architecture:** Keep `better-auth` as the implementation detail for browser auth, but wrap it in a reusable `core/auth` module so future product code does not import auth internals directly. Use a server-side BFF bridge route in the Next.js app to read the Better Auth account cookie and forward a validated bearer `id_token` to the FastAPI BFF without exposing provider tokens to arbitrary client components.

**Tech Stack:** Next.js App Router, React 19, better-auth, Better Auth Generic OAuth plugin, Node.js `node:test`, TypeScript, BFF `/me`

---

## File Structure

### Create

- `frontend/src/core/auth/config.ts`
- `frontend/src/core/auth/config.test.ts`
- `frontend/src/core/auth/types.ts`
- `frontend/src/core/auth/session.ts`
- `frontend/src/core/auth/session.test.ts`
- `frontend/src/core/auth/bff.ts`
- `frontend/src/core/auth/bff.test.ts`
- `frontend/src/core/auth/index.ts`
- `frontend/src/server/better-auth/account.ts`
- `frontend/src/server/better-auth/account.test.ts`
- `frontend/src/components/auth/login-button.tsx`
- `frontend/src/components/auth/logout-button.tsx`
- `frontend/src/components/auth/auth-status-card.tsx`
- `frontend/src/app/api/bff/me/route.ts`
- `frontend/src/app/workspace/account/page.tsx`

### Modify

- `frontend/src/env.js`
- `frontend/.env.example`
- `frontend/README.md`
- `frontend/src/server/better-auth/config.ts`
- `frontend/src/server/better-auth/client.ts`
- `frontend/src/server/better-auth/server.ts`
- `frontend/src/server/better-auth/index.ts`
- `frontend/src/components/workspace/workspace-header.tsx`
- `docs/superpowers/specs/2026-04-09-frontend-oidc-login-design.md`

## Task 1: Add Frontend Auth And BFF Environment Boundaries

**Files:**
- Create: `frontend/src/core/auth/config.ts`
- Create: `frontend/src/core/auth/config.test.ts`
- Modify: `frontend/src/env.js`
- Modify: `frontend/.env.example`
- Modify: `frontend/README.md`

- [ ] **Step 1: Write a failing test for auth config helpers**

Create `frontend/src/core/auth/config.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { getBffBaseURL, getOidcProviderId } = await import(
  new URL("./config.ts", import.meta.url).href
);

test("defaults the BFF base URL to the same-origin proxy path", () => {
  assert.equal(getBffBaseURL(), "/api/bff");
});

test("defaults the OIDC provider id to oidc", () => {
  assert.equal(getOidcProviderId(), "oidc");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/core/auth/config.test.ts`
Expected: FAIL with `Cannot find module` for `./config.ts`

- [ ] **Step 3: Add auth and BFF env fields**

Update `frontend/src/env.js` to add:

```js
    BETTER_AUTH_URL: z.string().optional(),
    BETTER_AUTH_OIDC_CLIENT_ID: z.string().optional(),
    BETTER_AUTH_OIDC_CLIENT_SECRET: z.string().optional(),
    BETTER_AUTH_OIDC_DISCOVERY_URL: z.string().optional(),
    BETTER_AUTH_OIDC_PROVIDER_ID: z.string().optional(),
```

and add client/runtime env fields:

```js
    NEXT_PUBLIC_BFF_BASE_URL: z.string().optional(),
```

with:

```js
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_OIDC_CLIENT_ID: process.env.BETTER_AUTH_OIDC_CLIENT_ID,
    BETTER_AUTH_OIDC_CLIENT_SECRET: process.env.BETTER_AUTH_OIDC_CLIENT_SECRET,
    BETTER_AUTH_OIDC_DISCOVERY_URL: process.env.BETTER_AUTH_OIDC_DISCOVERY_URL,
    BETTER_AUTH_OIDC_PROVIDER_ID: process.env.BETTER_AUTH_OIDC_PROVIDER_ID,
    NEXT_PUBLIC_BFF_BASE_URL: process.env.NEXT_PUBLIC_BFF_BASE_URL,
```

- [ ] **Step 4: Implement the config helper**

Create `frontend/src/core/auth/config.ts`:

```ts
import { env } from "@/env";

export function getOidcProviderId() {
  return env.BETTER_AUTH_OIDC_PROVIDER_ID ?? "oidc";
}

export function getBffBaseURL() {
  return env.NEXT_PUBLIC_BFF_BASE_URL?.replace(/\/+$/, "") ?? "/api/bff";
}
```

- [ ] **Step 5: Update example env and README**

Update `frontend/.env.example` to include:

```bash
# Better Auth / OIDC
# BETTER_AUTH_URL="http://localhost:3000"
# BETTER_AUTH_OIDC_CLIENT_ID="oidc-client-id"
# BETTER_AUTH_OIDC_CLIENT_SECRET="oidc-client-secret"
# BETTER_AUTH_OIDC_DISCOVERY_URL="https://issuer.example.com/.well-known/openid-configuration"
# BETTER_AUTH_OIDC_PROVIDER_ID="oidc"

# Public BFF base URL (defaults to /api/bff)
# NEXT_PUBLIC_BFF_BASE_URL="/api/bff"
```

Update `frontend/README.md` configuration section to mention:

```md
- `BETTER_AUTH_OIDC_CLIENT_ID`
- `BETTER_AUTH_OIDC_CLIENT_SECRET`
- `BETTER_AUTH_OIDC_DISCOVERY_URL`
- `NEXT_PUBLIC_BFF_BASE_URL`
```

- [ ] **Step 6: Run the config tests**

Run: `node --test frontend/src/core/auth/config.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/env.js frontend/.env.example frontend/README.md frontend/src/core/auth/config.ts frontend/src/core/auth/config.test.ts
git commit -m "feat: add frontend auth config boundaries"
```

## Task 2: Enable Better Auth OIDC Through Generic OAuth

**Files:**
- Create: `frontend/src/server/better-auth/account.ts`
- Create: `frontend/src/server/better-auth/account.test.ts`
- Modify: `frontend/src/server/better-auth/config.ts`
- Modify: `frontend/src/server/better-auth/client.ts`
- Modify: `frontend/src/server/better-auth/server.ts`
- Modify: `frontend/src/server/better-auth/index.ts`

- [ ] **Step 1: Write a failing test for account cookie extraction**

Create `frontend/src/server/better-auth/account.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { getOidcIdTokenFromAccount } = await import(
  new URL("./account.ts", import.meta.url).href
);

test("extracts an id_token from the Better Auth account cookie payload", () => {
  const token = getOidcIdTokenFromAccount({
    providerId: "oidc",
    idToken: "header.payload.signature",
  });

  assert.equal(token, "header.payload.signature");
});

test("returns null when the account payload does not include an id token", () => {
  const token = getOidcIdTokenFromAccount({
    providerId: "oidc",
  });

  assert.equal(token, null);
});
```

- [ ] **Step 2: Run the account test to verify it fails**

Run: `node --test frontend/src/server/better-auth/account.test.ts`
Expected: FAIL with `Cannot find module` for `./account.ts`

- [ ] **Step 3: Configure Better Auth for OIDC**

Update `frontend/src/server/better-auth/config.ts` to use the Generic OAuth plugin and stateless account-cookie support:

```ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

import { env } from "@/env";

const providerId = env.BETTER_AUTH_OIDC_PROVIDER_ID ?? "oidc";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  account: {
    storeAccountCookie: true,
    updateAccountOnSignIn: true,
  },
  plugins: env.BETTER_AUTH_OIDC_DISCOVERY_URL
    ? [
        genericOAuth({
          config: [
            {
              providerId,
              clientId: env.BETTER_AUTH_OIDC_CLIENT_ID!,
              clientSecret: env.BETTER_AUTH_OIDC_CLIENT_SECRET!,
              discoveryUrl: env.BETTER_AUTH_OIDC_DISCOVERY_URL,
              scopes: ["openid", "email", "profile"],
            },
          ],
        }),
      ]
    : [],
});
```

- [ ] **Step 4: Configure the client plugin**

Update `frontend/src/server/better-auth/client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
```

- [ ] **Step 5: Add reusable server helpers**

Create `frontend/src/server/better-auth/account.ts`:

```ts
import type { NextRequest } from "next/server";
import { getAccountCookie } from "better-auth/cookies";

export type BetterAuthAccountCookie = {
  providerId?: string;
  idToken?: string;
};

export async function getOidcAccount(request: NextRequest) {
  const account = (await getAccountCookie(request)) as
    | BetterAuthAccountCookie
    | null;
  return account;
}

export function getOidcIdTokenFromAccount(
  account: BetterAuthAccountCookie | null | undefined,
) {
  if (!account?.providerId || !account.idToken) {
    return null;
  }
  return account.idToken;
}
```

Update `frontend/src/server/better-auth/server.ts` to keep session access stable and export server helpers from `index.ts`:

```ts
import { headers } from "next/headers";
import { cache } from "react";

import { auth } from ".";

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
```

Update `frontend/src/server/better-auth/index.ts`:

```ts
export { auth } from "./config";
export { getSession } from "./server";
export { getOidcIdTokenFromAccount } from "./account";
```

- [ ] **Step 6: Run the account tests**

Run: `node --test frontend/src/server/better-auth/account.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/server/better-auth/config.ts frontend/src/server/better-auth/client.ts frontend/src/server/better-auth/server.ts frontend/src/server/better-auth/index.ts frontend/src/server/better-auth/account.ts frontend/src/server/better-auth/account.test.ts
git commit -m "feat: enable oidc through better auth"
```

## Task 3: Create The Reusable `core/auth` Session Boundary

**Files:**
- Create: `frontend/src/core/auth/types.ts`
- Create: `frontend/src/core/auth/session.ts`
- Create: `frontend/src/core/auth/session.test.ts`
- Create: `frontend/src/core/auth/index.ts`

- [ ] **Step 1: Write a failing test for session normalization**

Create `frontend/src/core/auth/session.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { toAuthSessionState } = await import(
  new URL("./session.ts", import.meta.url).href
);

test("normalizes an authenticated Better Auth session", () => {
  const state = toAuthSessionState({
    data: {
      session: { id: "session-1" },
      user: { id: "user-1", email: "demo@example.com", name: "Demo" },
    },
    isPending: false,
    error: null,
  });

  assert.equal(state.status, "authenticated");
  assert.equal(state.user?.email, "demo@example.com");
});

test("normalizes an unauthenticated state", () => {
  const state = toAuthSessionState({
    data: null,
    isPending: false,
    error: null,
  });

  assert.equal(state.status, "unauthenticated");
  assert.equal(state.user, null);
});
```

- [ ] **Step 2: Run the session test to verify it fails**

Run: `node --test frontend/src/core/auth/session.test.ts`
Expected: FAIL with `Cannot find module` for `./session.ts`

- [ ] **Step 3: Add auth-facing types**

Create `frontend/src/core/auth/types.ts`:

```ts
export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type AuthSessionState = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  errorMessage: string | null;
};
```

- [ ] **Step 4: Implement the session adapter**

Create `frontend/src/core/auth/session.ts`:

```ts
import type { AuthSessionState } from "./types";

type BetterAuthSessionResult = {
  data:
    | {
        user: { id: string; email?: string | null; name?: string | null };
      }
    | null;
  isPending: boolean;
  error: { message?: string } | null;
};

export function toAuthSessionState(
  session: BetterAuthSessionResult,
): AuthSessionState {
  if (session.isPending) {
    return { status: "loading", user: null, errorMessage: null };
  }

  if (!session.data?.user) {
    return {
      status: "unauthenticated",
      user: null,
      errorMessage: session.error?.message ?? null,
    };
  }

  return {
    status: "authenticated",
    user: {
      id: session.data.user.id,
      email: session.data.user.email ?? null,
      name: session.data.user.name ?? null,
    },
    errorMessage: session.error?.message ?? null,
  };
}
```

- [ ] **Step 5: Export the auth module boundary**

Create `frontend/src/core/auth/index.ts`:

```ts
export * from "./config";
export * from "./session";
export type * from "./types";
```

- [ ] **Step 6: Run the session tests**

Run: `node --test frontend/src/core/auth/session.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/auth/types.ts frontend/src/core/auth/session.ts frontend/src/core/auth/session.test.ts frontend/src/core/auth/index.ts
git commit -m "feat: add reusable frontend auth session boundary"
```

## Task 4: Build The BFF Auth Bridge Helper And Proxy Route

**Files:**
- Create: `frontend/src/core/auth/bff.ts`
- Create: `frontend/src/core/auth/bff.test.ts`
- Create: `frontend/src/app/api/bff/me/route.ts`
- Modify: `frontend/src/core/auth/index.ts`

- [ ] **Step 1: Write a failing test for the BFF bridge helper**

Create `frontend/src/core/auth/bff.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { buildBffMeRequest } = await import(
  new URL("./bff.ts", import.meta.url).href
);

test("builds a proxied BFF /me request with a bearer id token", () => {
  const request = buildBffMeRequest({
    baseURL: "http://127.0.0.1:9000",
    idToken: "header.payload.signature",
  });

  assert.equal(request.url, "http://127.0.0.1:9000/me");
  assert.equal(
    request.init.headers instanceof Headers
      ? request.init.headers.get("authorization")
      : null,
    "Bearer header.payload.signature",
  );
});
```

- [ ] **Step 2: Run the BFF bridge test to verify it fails**

Run: `node --test frontend/src/core/auth/bff.test.ts`
Expected: FAIL with `Cannot find module` for `./bff.ts`

- [ ] **Step 3: Implement the BFF helper**

Create `frontend/src/core/auth/bff.ts`:

```ts
type BuildBffMeRequestInput = {
  baseURL: string;
  idToken: string;
};

export function buildBffMeRequest({
  baseURL,
  idToken,
}: BuildBffMeRequestInput) {
  return {
    url: `${baseURL.replace(/\/+$/, "")}/me`,
    init: {
      headers: new Headers({
        Authorization: `Bearer ${idToken}`,
      }),
    },
  };
}
```

- [ ] **Step 4: Add the Next.js bridge route**

Create `frontend/src/app/api/bff/me/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBffBaseURL } from "@/core/auth/config";
import { buildBffMeRequest } from "@/core/auth/bff";
import { auth } from "@/server/better-auth";
import {
  getOidcAccount,
  getOidcIdTokenFromAccount,
} from "@/server/better-auth/account";

export async function GET(request: NextRequest) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.session) {
    return NextResponse.json(
      { code: "unauthenticated", message: "Sign in required" },
      { status: 401 },
    );
  }

  const account = await getOidcAccount(request);
  const idToken = getOidcIdTokenFromAccount(account);

  if (!idToken) {
    return NextResponse.json(
      { code: "missing_oidc_token", message: "OIDC token unavailable" },
      { status: 401 },
    );
  }

  const request = buildBffMeRequest({
    baseURL: getBffBaseURL(),
    idToken,
  });

  const response = await fetch(request.url, request.init);
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
```

- [ ] **Step 5: Export the bridge helper**

Update `frontend/src/core/auth/index.ts`:

```ts
export * from "./bff";
export * from "./config";
export * from "./session";
export type * from "./types";
```

- [ ] **Step 6: Run the BFF bridge tests**

Run: `node --test frontend/src/core/auth/bff.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/auth/bff.ts frontend/src/core/auth/bff.test.ts frontend/src/core/auth/index.ts frontend/src/app/api/bff/me/route.ts
git commit -m "feat: add frontend bff auth bridge"
```

## Task 5: Add Client-Facing Auth Actions And Minimal Account UI

**Files:**
- Create: `frontend/src/components/auth/login-button.tsx`
- Create: `frontend/src/components/auth/logout-button.tsx`
- Create: `frontend/src/components/auth/auth-status-card.tsx`
- Create: `frontend/src/app/workspace/account/page.tsx`
- Modify: `frontend/src/components/workspace/workspace-header.tsx`

- [ ] **Step 1: Write a regression test for session loading state**

Append to `frontend/src/core/auth/session.test.ts`:

```ts
test("keeps loading state when the Better Auth hook is still pending", () => {
  const state = toAuthSessionState({
    data: null,
    isPending: true,
    error: null,
  });

  assert.equal(state.status, "loading");
});
```

- [ ] **Step 2: Run the session tests**

Run: `node --test frontend/src/core/auth/session.test.ts`
Expected: PASS after Task 3 implementation remains intact

- [ ] **Step 3: Add thin login and logout buttons**

Create `frontend/src/components/auth/login-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";
import { getOidcProviderId } from "@/core/auth/config";

export function LoginButton() {
  return (
    <Button
      onClick={() =>
        authClient.signIn.oauth2({
          providerId: getOidcProviderId(),
          callbackURL: "/workspace/account",
        })
      }
    >
      Sign in
    </Button>
  );
}
```

Create `frontend/src/components/auth/logout-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";

export function LogoutButton() {
  return <Button onClick={() => authClient.signOut()}>Sign out</Button>;
}
```

- [ ] **Step 4: Add the minimum auth status card**

Create `frontend/src/components/auth/auth-status-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { LoginButton } from "./login-button";
import { LogoutButton } from "./logout-button";
import { authClient } from "@/server/better-auth/client";
import { toAuthSessionState } from "@/core/auth/session";

export function AuthStatusCard() {
  const session = authClient.useSession();
  const state = toAuthSessionState(session);
  const [bffUser, setBffUser] = useState<unknown>(null);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    void fetch("/api/bff/me")
      .then((response) => response.json())
      .then((data) => setBffUser(data));
  }, [state.status]);

  if (state.status === "loading") {
    return <div>Loading authentication…</div>;
  }

  if (state.status === "unauthenticated") {
    return (
      <div className="space-y-3">
        <p>Not signed in.</p>
        <LoginButton />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p>{state.user?.email ?? state.user?.name ?? state.user?.id}</p>
      <pre>{JSON.stringify(bffUser, null, 2)}</pre>
      <LogoutButton />
    </div>
  );
}
```

- [ ] **Step 5: Add the minimum account page and navigation entry**

Create `frontend/src/app/workspace/account/page.tsx`:

```tsx
import { AuthStatusCard } from "@/components/auth/auth-status-card";

export default function WorkspaceAccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <AuthStatusCard />
    </div>
  );
}
```

Update `frontend/src/components/workspace/workspace-header.tsx` to add a stable link:

```tsx
<Link className="text-muted-foreground" href="/workspace/account">
  Account
</Link>
```

Keep `frontend/src/app/workspace/layout.tsx` as the page shell; do not add auth logic there yet.

- [ ] **Step 6: Run typecheck for the UI slice**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/auth/login-button.tsx frontend/src/components/auth/logout-button.tsx frontend/src/components/auth/auth-status-card.tsx frontend/src/app/workspace/account/page.tsx frontend/src/components/workspace/workspace-header.tsx
git commit -m "feat: add frontend oidc account proof page"
```

## Task 6: Document The New Frontend Auth Boundary

**Files:**
- Modify: `frontend/README.md`
- Modify: `docs/superpowers/specs/2026-04-09-frontend-oidc-login-design.md`

- [ ] **Step 1: Update the frontend README**

Add a section explaining:

```md
## Auth Development

- `src/server/better-auth/` contains the Better Auth implementation details
- `src/core/auth/` is the stable auth boundary for the rest of the app
- `/api/bff/me` is the first authenticated bridge route to the FastAPI BFF
- `/workspace/account` is the minimum proof page for browser OIDC login and BFF `/me`
```

- [ ] **Step 2: Update the spec with implementation notes**

Append a short note to `docs/superpowers/specs/2026-04-09-frontend-oidc-login-design.md`:

```md
## Implementation Notes

- the first bridge implementation uses a same-origin Next.js route at `/api/bff/me`
- the bridge keeps provider tokens on the server side instead of handing them to random client components
- the first user-facing proof page is `/workspace/account`
```

- [ ] **Step 3: Run lint**

Run: `cd frontend && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md docs/superpowers/specs/2026-04-09-frontend-oidc-login-design.md
git commit -m "docs: describe frontend auth boundary"
```

## Task 7: Final Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run all frontend auth-focused tests**

Run:

```bash
node --test \
  frontend/src/core/auth/config.test.ts \
  frontend/src/core/auth/session.test.ts \
  frontend/src/core/auth/bff.test.ts \
  frontend/src/server/better-auth/account.test.ts
```

Expected: PASS

- [ ] **Step 2: Run lint**

Run: `cd frontend && pnpm lint`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Run a production-oriented build**

Run: `cd frontend && pnpm build`
Expected: PASS

- [ ] **Step 5: Check working tree**

Run: `git status --short`
Expected: clean working tree or only intentional uncommitted files
