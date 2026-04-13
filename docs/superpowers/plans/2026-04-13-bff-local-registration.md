# BFF Local Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal username/password self-registration flow for local BFF auth and sign the user into the existing local session immediately after registration.

**Architecture:** Extend the current local-auth path rather than introducing a second session model. The BFF gains a `POST /auth/register` endpoint backed by `AuthService`, while the frontend mirrors the existing local login bridge and account-page flow with a register mode that writes the same cookie and browser session state used today.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, Next.js App Router, React 19, node:test

---

### Task 1: Add failing BFF registration tests

**Files:**
- Modify: `bff/tests/services/test_auth_service.py`
- Modify: `bff/tests/api/test_auth_routes.py`
- Test: `bff/tests/services/test_auth_service.py`
- Test: `bff/tests/api/test_auth_routes.py`

- [ ] **Step 1: Write the failing service tests**

```python
def test_register_creates_local_user_and_returns_bearer_token(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    created_user = SimpleNamespace(id="user-456", username="new-user")

    class FakeRepo:
        def __init__(self, db) -> None:
            calls.append(("repo_init", db))

        def get_by_username(self, username: str):
            calls.append(("get_by_username", username))
            return None

        def create_local_user(self, username: str, password_hash: str, status: str = "active"):
            calls.append(("create_local_user", username, password_hash, status))
            return created_user

    monkeypatch.setattr(auth_service_module, "UserRepository", FakeRepo)
    monkeypatch.setattr(auth_service_module, "create_access_token", lambda user_id: f"token-{user_id}")
    monkeypatch.setattr(auth_service_module, "get_password_hash", lambda password: f"hashed:{password}")

    response = AuthService(db_session).register(" new-user ", "secret123")

    assert response.access_token == "token-user-456"
    assert calls == [
        ("repo_init", db_session),
        ("get_by_username", "new-user"),
        ("create_local_user", "new-user", "hashed:secret123", "active"),
    ]
```

```python
def test_register_rejects_duplicate_username(client) -> None:
    response = client.post("/auth/register", json={"username": "demo", "password": "secret123"})

    assert response.status_code == 409
    assert response.json()["code"] == "username_exists"
```
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bff && uv run pytest bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py -q`
Expected: FAIL because `AuthService.register`, `RegisterRequest`, and `/auth/register` do not exist yet.

- [ ] **Step 3: Write minimal BFF implementation**

```python
class RegisterRequest(BaseModel):
    username: str
    password: str
```

```python
@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db: Session = Depends(get_db_session)) -> TokenResponse:
    return AuthService(db).register(payload.username, payload.password)
```

```python
def register(self, username: str, password: str) -> TokenResponse:
    if not isinstance(self.provider, LocalAuthProvider):
        raise error_response(404, "local_registration_disabled", "Local registration is unavailable")
    normalized_username = username.strip()
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bff && uv run pytest bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py -q`
Expected: PASS with new registration coverage green.

- [ ] **Step 5: Commit**

```bash
git add bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py bff/app/schemas/auth.py bff/app/api/routes/auth.py bff/app/services/auth_service.py
git commit -m "feat: add bff local registration"
```

### Task 2: Cover validation and non-local behavior

**Files:**
- Modify: `bff/tests/services/test_auth_service.py`
- Modify: `bff/tests/api/test_auth_routes.py`
- Modify: `bff/app/services/auth_service.py`

- [ ] **Step 1: Write the failing validation tests**

```python
def test_register_rejects_short_password(client) -> None:
    response = client.post("/auth/register", json={"username": "new-user", "password": "short"})

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_password"
```

```python
def test_register_is_unavailable_when_oidc_provider_is_active(db_session, monkeypatch) -> None:
    settings = Settings(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)

    with pytest.raises(HTTPException) as exc:
        AuthService(db_session).register("new-user", "secret123")

    assert exc.value.status_code == 404
```
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bff && uv run pytest bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py -q`
Expected: FAIL with missing validation and non-local rejection behavior.

- [ ] **Step 3: Implement the validation rules**

```python
def _normalize_registration_username(self, username: str) -> str:
    normalized = username.strip()
    if not normalized or len(normalized) < 3 or len(normalized) > 64:
        raise error_response(400, "invalid_username", "Username must be between 3 and 64 characters")
    return normalized

def _validate_registration_password(self, password: str) -> None:
    if len(password) < 8:
        raise error_response(400, "invalid_password", "Password must be at least 8 characters")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bff && uv run pytest bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py -q`
Expected: PASS with `400`, `409`, and `404` behavior covered.

- [ ] **Step 5: Commit**

```bash
git add bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py bff/app/services/auth_service.py
git commit -m "test: cover local registration validation"
```

### Task 3: Add failing frontend local register bridge tests

**Files:**
- Create: `frontend/src/app/api/auth/local/register/route.boundary.test.ts`
- Modify: `frontend/src/core/auth/browser.ts`
- Create: `frontend/src/app/api/auth/local/register/route.ts`
- Test: `frontend/src/app/api/auth/local/register/route.boundary.test.ts`

- [ ] **Step 1: Write the failing route boundary test**

```typescript
void test("local register route forwards to BFF register and sets the same auth cookie path as login", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(source.includes('"/auth/register"'));
  assert.ok(source.includes("getBffLocalAuthCookieName"));
  assert.ok(source.includes("toLocalDevSession"));
  assert.ok(source.includes('"deer-flow-local-auth-active"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/app/api/auth/local/register/route.boundary.test.ts`
Expected: FAIL because the route file does not exist yet.

- [ ] **Step 3: Write minimal bridge implementation**

```typescript
const registerResponse = await fetch(`${getInternalBffBaseURL()}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: payload.username ?? "", password: payload.password ?? "" }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/app/api/auth/local/register/route.boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/auth/local/register/route.boundary.test.ts frontend/src/app/api/auth/local/register/route.ts
git commit -m "feat: add frontend local register bridge"
```

### Task 4: Add failing browser auth helper tests and implementation

**Files:**
- Create: `frontend/src/core/auth/browser.test.ts`
- Modify: `frontend/src/core/auth/browser.ts`
- Test: `frontend/src/core/auth/browser.test.ts`

- [ ] **Step 1: Write the failing helper test**

```typescript
void test("signUpWithLocalPassword posts to the local register route and persists the returned session", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const { signUpWithLocalPassword } = await import(new URL("./browser.ts", import.meta.url).href);

  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        accessToken: "token-123",
        session: {
          session: {
            id: "local-dev-session",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: "user-1",
            expiresAt: new Date().toISOString(),
            token: "local-dev-session",
            ipAddress: null,
            userAgent: "local-dev-auth",
          },
          user: {
            id: "user-1",
            email: null,
            name: "new-user",
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            image: null,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  await signUpWithLocalPassword("new-user", "secret123");

  assert.equal(String(calls[0]?.input), "/api/auth/local/register");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/core/auth/browser.test.ts`
Expected: FAIL because `signUpWithLocalPassword` does not exist yet.

- [ ] **Step 3: Implement the helper with the existing local-session writer**

```typescript
export async function signUpWithLocalPassword(username: string, password: string) {
  const response = await fetch("/api/auth/local/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  ...
  writeLocalDevSession(session, payload.accessToken ?? null);
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/core/auth/browser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/auth/browser.test.ts frontend/src/core/auth/browser.ts
git commit -m "feat: add frontend local register client helper"
```

### Task 5: Add failing account page tests and registration UI

**Files:**
- Modify: `frontend/src/components/auth/account-page-boundary.test.ts`
- Modify: `frontend/src/components/auth/auth-status-card.tsx`
- Test: `frontend/src/components/auth/account-page-boundary.test.ts`

- [ ] **Step 1: Write the failing UI boundary tests**

```typescript
assert.ok(
  source.includes("Register"),
  "expected local auth mode to expose a register mode",
);
assert.ok(
  source.includes("confirm-password"),
  "expected register mode to include a confirm password field",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/components/auth/account-page-boundary.test.ts`
Expected: FAIL because the current card only exposes login controls.

- [ ] **Step 3: Implement the minimal register mode**

```tsx
const [authMode, setAuthMode] = useState<"login" | "register">("login");
const [confirmPassword, setConfirmPassword] = useState("");

if (authMode === "register" && password !== confirmPassword) {
  setLocalLoginError("Passwords do not match");
  return;
}

await signUpWithLocalPassword(username, password);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/components/auth/account-page-boundary.test.ts`
Expected: PASS with register toggle and confirm-password coverage.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/account-page-boundary.test.ts frontend/src/components/auth/auth-status-card.tsx
git commit -m "feat: add local registration mode to account page"
```

### Task 6: Update docs and run verification

**Files:**
- Modify: `bff/README.md`
- Modify: `bff/docs/DEVELOPMENT.md`
- Modify: `bff/docs/ROADMAP.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: Document the new local registration behavior**

```md
- `POST /auth/register` is available only when `BFF_AUTH_PROVIDER=local`
- local registration supports username/password only in this slice
- email verification and password reset remain future work
```

- [ ] **Step 2: Run backend verification**

Run: `cd bff && uv run pytest bff/tests/services/test_auth_service.py bff/tests/api/test_auth_routes.py -q`
Expected: PASS.

- [ ] **Step 3: Run frontend verification**

Run: `cd frontend && node --test src/app/api/auth/local/register/route.boundary.test.ts src/core/auth/browser.test.ts src/components/auth/account-page-boundary.test.ts src/core/auth/local.test.ts`
Expected: PASS.

- [ ] **Step 4: Run static checks for touched code**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bff/README.md bff/docs/DEVELOPMENT.md bff/docs/ROADMAP.md frontend/README.md
git commit -m "docs: document local registration flow"
```
