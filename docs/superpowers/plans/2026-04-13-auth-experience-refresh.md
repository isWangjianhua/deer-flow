# Auth Experience Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the login experience by turning `/workspace/account` into a cleaner account/auth hub and intercepting unauthenticated chat submits with a reusable login dialog that preserves the drafted message.

**Architecture:** Split the current `auth-status-card` into smaller auth-focused units: a reusable `AuthPanel`, a secondary account/session status card, and a `LoginRequiredDialog` for chat interception. Keep auth state on the existing browser-session boundary, and implement chat-side guarding in the chat page layer, with a small `InputBox` enhancement so a restored draft can be written back after login without auto-submitting.

**Tech Stack:** Next.js App Router, React 19, TypeScript, node:test, existing local/OIDC auth bridge, existing i18n context/hooks

---

## File Structure

Planned files and responsibilities:

- Create: `frontend/src/components/auth/auth-panel.tsx`
  Shared login/register surface for page and dialog contexts, focused on auth success/error flows rather than settings controls.
- Create: `frontend/src/components/auth/auth-panel.boundary.test.ts`
  Boundary coverage for shared auth panel structure and mode-specific affordances.
- Create: `frontend/src/components/auth/account-session-card.tsx`
  Secondary account card for browser session, BFF status, and collapsible diagnostics.
- Create: `frontend/src/components/auth/login-required-dialog.tsx`
  Dialog wrapper around `AuthPanel`, used by chat pages.
- Create: `frontend/src/components/auth/login-required-dialog.boundary.test.ts`
  Boundary coverage for dialog composition and pending-message UX copy.
- Modify: `frontend/src/components/auth/auth-status-card.tsx`
  Reduce or replace current monolith by re-exporting/refactoring into smaller components.
- Modify: `frontend/src/app/workspace/account/page.tsx`
  Compose refreshed account page using `AuthPanel` and `AccountSessionCard`.
- Modify: `frontend/src/components/auth/account-page-boundary.test.ts`
  Update page-level structure expectations for the refreshed account layout.
- Modify: `frontend/src/components/workspace/chats/chat-page.tsx`
  Add unauthenticated submit interception, pending-message state, and dialog integration.
- Modify: `frontend/src/components/workspace/input-box.tsx`
  Add a draft-restore path so input text can be restored after login.
- Modify: `frontend/src/components/workspace/input-box-boundary.test.ts`
  Cover the new input restore behavior or contract.
- Create: `frontend/src/components/workspace/chats/chat-auth-guard.test.ts`
  Boundary coverage for unauthenticated submit interception and non-auto-submit behavior.
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
  Add auth/account-specific copy for page and dialog.
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`
  Add matching Chinese copy.
- Modify: `frontend/src/core/i18n/locales/types.ts`
  Add the new translation shape for auth/account strings.

### Task 1: Extract a shared auth panel contract

**Files:**
- Create: `frontend/src/components/auth/auth-panel.boundary.test.ts`
- Create: `frontend/src/components/auth/auth-panel.tsx`
- Modify: `frontend/src/components/auth/auth-status-card.tsx`

- [ ] **Step 1: Write the failing auth panel boundary test**

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("auth panel exposes shared page/dialog auth UI primitives", async () => {
  const source = await readFile(new URL("./auth-panel.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes('mode?: "page" | "dialog"'),
    "expected AuthPanel to support both page and dialog presentation modes",
  );
  assert.ok(
    source.includes("onSuccess?: () => void"),
    "expected AuthPanel to notify callers when authentication succeeds",
  );
  assert.ok(
    !source.includes("changeLocale"),
    "expected AuthPanel to stay focused on auth instead of locale settings",
  );
  assert.ok(
    source.includes("signUpWithLocalPassword"),
    "expected AuthPanel to handle local registration directly",
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd frontend && node --test src/components/auth/auth-panel.boundary.test.ts`
Expected: FAIL because `auth-panel.tsx` does not exist yet.

- [ ] **Step 3: Implement the minimal shared auth panel**

```tsx
export function AuthPanel({
  mode = "page",
  defaultTab = "login",
  onSuccess,
}: {
  mode?: "page" | "dialog";
  defaultTab?: "login" | "register";
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const [authMode, setAuthMode] = useState<"login" | "register">(defaultTab);
  // move local login/register logic here from auth-status-card
  // call onSuccess?.() after successful local or OIDC auth
}
```

```tsx
// auth-status-card.tsx becomes a thin composition layer or is replaced by
// AccountSessionCard in later tasks rather than keeping login form logic inline.
```

- [ ] **Step 4: Run the auth panel test to verify it passes**

Run: `cd frontend && node --test src/components/auth/auth-panel.boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/auth-panel.tsx frontend/src/components/auth/auth-panel.boundary.test.ts frontend/src/components/auth/auth-status-card.tsx
git commit -m "refactor: extract shared auth panel"
```

### Task 2: Refresh the account page layout and keep language settings centralized

**Files:**
- Modify: `frontend/src/app/workspace/account/page.tsx`
- Create: `frontend/src/components/auth/account-session-card.tsx`
- Modify: `frontend/src/components/auth/account-page-boundary.test.ts`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/core/i18n/locales/types.ts`

- [ ] **Step 1: Write the failing account-page boundary tests**

```typescript
void test("account page promotes auth as the primary action without embedding language settings", async () => {
  const pageSource = await readFile(
    new URL("../../app/workspace/account/page.tsx", import.meta.url),
    "utf8",
  );
  const panelSource = await readFile(new URL("./auth-panel.tsx", import.meta.url), "utf8");

  assert.ok(
    pageSource.includes("AuthPanel"),
    "expected the account page to compose a shared AuthPanel",
  );
  assert.ok(
    pageSource.includes("AccountSessionCard"),
    "expected the account page to separate auth UI from session diagnostics",
  );
  assert.ok(
    !panelSource.includes("changeLocale"),
    "expected the shared auth panel to avoid owning language settings",
  );
});
```

- [ ] **Step 2: Run the updated boundary test to verify it fails**

Run: `cd frontend && node --test src/components/auth/account-page-boundary.test.ts`
Expected: FAIL because the page still renders the older monolithic auth/status card.

- [ ] **Step 3: Implement the account-page composition and i18n copy**

```tsx
export default function WorkspaceAccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">...</h1>
          <p className="text-muted-foreground text-sm">...</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <AuthPanel mode="page" />
        <AccountSessionCard />
      </div>
    </div>
  );
}
```

```typescript
// locales/types.ts
authExperience: {
  accountTitle: string;
  accountDescription: string;
  loginTitle: string;
  registerTitle: string;
  // add the exact strings used by AuthPanel and dialog
};
```

- [ ] **Step 4: Run the boundary test to verify it passes**

Run: `cd frontend && node --test src/components/auth/account-page-boundary.test.ts src/components/auth/auth-panel.boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/workspace/account/page.tsx frontend/src/components/auth/account-page-boundary.test.ts frontend/src/components/auth/account-session-card.tsx frontend/src/core/i18n/locales/en-US.ts frontend/src/core/i18n/locales/zh-CN.ts frontend/src/core/i18n/locales/types.ts
git commit -m "feat: refresh account page auth layout"
```

### Task 3: Add a reusable login-required dialog

**Files:**
- Create: `frontend/src/components/auth/login-required-dialog.tsx`
- Create: `frontend/src/components/auth/login-required-dialog.boundary.test.ts`
- Modify: `frontend/src/components/auth/login-button.tsx`

- [ ] **Step 1: Write the failing dialog boundary test**

```typescript
void test("login-required dialog reuses the shared auth panel", async () => {
  const source = await readFile(
    new URL("./login-required-dialog.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("Dialog"));
  assert.ok(source.includes("AuthPanel"));
  assert.ok(
    source.includes('mode="dialog"'),
    "expected the login dialog to reuse AuthPanel in dialog mode",
  );
  assert.ok(
    source.includes("Please sign in before sending"),
    "expected dialog copy to explain why auth is needed",
  );
});
```

- [ ] **Step 2: Run the dialog test to verify it fails**

Run: `cd frontend && node --test src/components/auth/login-required-dialog.boundary.test.ts`
Expected: FAIL because the dialog file does not exist yet.

- [ ] **Step 3: Implement the reusable login dialog**

```tsx
export function LoginRequiredDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>...</DialogTitle>
          <DialogDescription>...</DialogDescription>
        </DialogHeader>
        <AuthPanel mode="dialog" onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the dialog test to verify it passes**

Run: `cd frontend && node --test src/components/auth/login-required-dialog.boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/login-required-dialog.tsx frontend/src/components/auth/login-required-dialog.boundary.test.ts
git commit -m "feat: add reusable login required dialog"
```

### Task 4: Support draft restoration in the input box

**Files:**
- Modify: `frontend/src/components/workspace/input-box.tsx`
- Modify: `frontend/src/components/workspace/input-box-boundary.test.ts`

- [ ] **Step 1: Write the failing input-box boundary test**

```typescript
void test("input box can restore a pending draft after login without auto-submitting", async () => {
  const source = await readFile(new URL("./input-box.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("restoreDraft"),
    "expected InputBox to expose a restoreDraft-style prop for pending auth resumes",
  );
  assert.ok(
    source.includes("textInput.setInput"),
    "expected InputBox to write restored text back through the prompt controller",
  );
  assert.ok(
    !source.includes("setTimeout(() => onSubmit?.(message), 0) // restore"),
    "expected draft restoration to avoid auto-submitting the message",
  );
});
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run: `cd frontend && node --test src/components/workspace/input-box-boundary.test.ts`
Expected: FAIL because `InputBox` only supports first-mount `initialValue`.

- [ ] **Step 3: Implement the minimal draft restore path**

```tsx
export function InputBox({
  restoreDraft,
  ...
}: {
  restoreDraft?: { value: string; token: number } | null;
  ...
}) {
  const { textInput } = usePromptInputController();

  useEffect(() => {
    if (!restoreDraft) {
      return;
    }
    textInput.setInput(restoreDraft.value);
  }, [restoreDraft, textInput]);
}
```

- [ ] **Step 4: Run the boundary test to verify it passes**

Run: `cd frontend && node --test src/components/workspace/input-box-boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/input-box.tsx frontend/src/components/workspace/input-box-boundary.test.ts
git commit -m "feat: support auth draft restoration in input box"
```

### Task 5: Intercept unauthenticated chat submits

**Files:**
- Create: `frontend/src/components/workspace/chats/chat-auth-guard.test.ts`
- Modify: `frontend/src/components/workspace/chats/chat-page.tsx`
- Modify: `frontend/src/components/auth/login-required-dialog.tsx`

- [ ] **Step 1: Write the failing chat auth-guard boundary test**

```typescript
void test("chat page opens login dialog and preserves the drafted message for unauthenticated users", async () => {
  const source = await readFile(new URL("./chat-page.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("LoginRequiredDialog"),
    "expected chat page to render the login-required dialog",
  );
  assert.ok(
    source.includes("pendingAuthMessage"),
    "expected chat page to preserve the pending message while login is required",
  );
  assert.ok(
    source.includes('state.status !== "authenticated"'),
    "expected chat submission to guard against unauthenticated sends",
  );
  assert.ok(
    source.includes("restoreDraft"),
    "expected successful login to restore the drafted message into InputBox",
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd frontend && node --test src/components/workspace/chats/chat-auth-guard.test.ts`
Expected: FAIL because chat submission currently sends directly without an auth gate.

- [ ] **Step 3: Implement the chat-page auth interception**

```tsx
const session = useBrowserAuthSession();
const state = toAuthSessionState(session);
const [loginDialogOpen, setLoginDialogOpen] = useState(false);
const [pendingAuthMessage, setPendingAuthMessage] = useState<PromptInputMessage | null>(null);
const [restoreDraft, setRestoreDraft] = useState<{ value: string; token: number } | null>(null);

const handleSubmit = useCallback((message: PromptInputMessage) => {
  if (state.status !== "authenticated") {
    setPendingAuthMessage(message);
    setLoginDialogOpen(true);
    return;
  }
  void sendMessage(threadId, message);
}, [sendMessage, state.status, threadId]);

const handleLoginSuccess = useCallback(() => {
  if (pendingAuthMessage?.text) {
    setRestoreDraft({ value: pendingAuthMessage.text, token: Date.now() });
  }
  setLoginDialogOpen(false);
}, [pendingAuthMessage]);
```

- [ ] **Step 4: Run the chat auth-guard test to verify it passes**

Run: `cd frontend && node --test src/components/workspace/chats/chat-auth-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/chats/chat-page.tsx frontend/src/components/workspace/chats/chat-auth-guard.test.ts frontend/src/components/auth/login-required-dialog.tsx
git commit -m "feat: intercept unauthenticated chat submits"
```

### Task 6: Full verification for the auth refresh slice

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: Document the refreshed auth entrypoints**

```md
- `/workspace/account` now acts as the account and sign-in hub
- language switching remains centralized in settings rather than duplicated in account
- unauthenticated chat sends now open an in-place login dialog and preserve the drafted message
```

- [ ] **Step 2: Run focused frontend tests**

Run: `cd frontend && node --test src/components/auth/account-page-boundary.test.ts src/components/auth/auth-panel.boundary.test.ts src/components/auth/login-required-dialog.boundary.test.ts src/components/workspace/input-box-boundary.test.ts src/components/workspace/chats/chat-auth-guard.test.ts`
Expected: PASS.

- [ ] **Step 3: Run auth regression tests**

Run: `cd frontend && node --test src/core/auth/browser.test.ts src/core/auth/browser-state.test.ts src/core/auth/local.test.ts`
Expected: PASS.

- [ ] **Step 4: Run static verification**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/README.md
git commit -m "docs: describe refreshed auth experience"
```
