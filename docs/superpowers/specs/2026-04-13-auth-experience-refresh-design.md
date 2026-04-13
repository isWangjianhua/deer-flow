# Auth Experience Refresh Design

Date: 2026-04-13

## Summary

Improve the frontend login experience as a coherent product surface rather than a scattered set of auth affordances.

This slice includes:

- a cleaner `/workspace/account` page
- direct language switching on the account page
- a shared auth panel used by both the account page and a login-required dialog
- login interception when an unauthenticated user tries to send a chat message

This slice intentionally does not change the BFF auth contract.

## Problem

The current auth experience works but feels fragmented:

- `/workspace/account` mixes product-facing account UI with low-level diagnostics
- the account page does not expose language switching even though the app already supports it
- login UI is not structured for reuse in other auth entrypoints
- unauthenticated chat submission does not guide the user through a clean login flow

The result is a working but uneven experience, especially around sign-in and recovery from unauthenticated actions.

## Goals

- Make `/workspace/account` feel like a proper account and sign-in entrypoint.
- Expose language switching directly on the account page.
- Reuse one auth panel across page and dialog contexts.
- Intercept unauthenticated chat submission and open a login dialog.
- Preserve the user’s drafted message after login and require explicit resend.
- Keep local auth and OIDC flows both supported.

## Non-Goals

- Do not change BFF login, registration, or session APIs.
- Do not add email verification, password reset, or new auth providers.
- Do not introduce a global auth modal for every action in the app.
- Do not redesign the settings system.
- Do not auto-send the pending message after login.

## Current Context

Relevant existing pieces already exist:

- `frontend/src/components/auth/auth-status-card.tsx` contains the current account-page login and status UI
- `frontend/src/core/i18n/hooks.ts` already supports locale changes through app context and cookies
- `frontend/src/components/workspace/settings/appearance-settings-page.tsx` already exposes the language switcher pattern
- chat submission flows through `frontend/src/components/workspace/chats/chat-page.tsx` into `frontend/src/components/workspace/input-box.tsx`
- local and OIDC auth already share `useBrowserAuthSession`

The main issue is not missing capability. It is missing composition and polish.

## Chosen Approach

Split the current account/auth surface into focused UI units and reuse them:

1. Extract a reusable `AuthPanel` that owns login and registration interactions.
2. Keep account diagnostics in a separate secondary card rather than inside the primary auth surface.
3. Add a `LoginRequiredDialog` that reuses `AuthPanel`.
4. Intercept unauthenticated chat submit attempts at the chat-page level.
5. Restore the drafted message into the input after successful login, but do not auto-submit it.

This keeps auth behavior centralized while improving the user experience in both page and modal contexts.

## Alternatives Considered

### Option 1: Shared auth panel for both account page and dialog

Pros:

- one auth UI to maintain
- consistent local and OIDC behavior
- easiest long-term evolution

Cons:

- requires component split from the current account page

### Option 2: Separate account page auth UI and chat login dialog

Pros:

- can be implemented quickly with less immediate refactoring

Cons:

- duplicates auth presentation logic
- likely to drift visually and behaviorally

### Option 3: Only polish account page and redirect chat users there

Pros:

- smallest implementation surface

Cons:

- worse chat experience
- loses user context during submit attempts

Option 1 is the chosen approach.

## Component Design

### `AuthPanel`

Create a reusable auth-focused component responsible for:

- rendering local login/register form in local mode
- rendering OIDC sign-in CTA in OIDC mode
- showing inline errors and submit states
- exposing a compact language switcher
- notifying callers when login succeeds

Inputs should include:

- presentation mode: `page` or `dialog`
- optional `defaultTab`
- optional `onSuccess`

The component should not own diagnostics or broader account status presentation.

### `AccountSessionCard`

Keep session and BFF status as a separate secondary card on `/workspace/account`.

This card should:

- summarize browser auth state
- summarize BFF `/me` connectivity
- keep raw diagnostics collapsible

Diagnostics remain available, but they should no longer dominate the page.

### `LoginRequiredDialog`

Add a dialog wrapper around `AuthPanel`.

This dialog should:

- explain that sign-in is required before sending
- support both local and OIDC auth modes
- close on successful login
- return control to the chat page without navigation

## Account Page Design

Update `/workspace/account` to use a clearer layout:

- top area: page title, short explanation, language switcher
- primary card: shared `AuthPanel`
- secondary card: `AccountSessionCard`

The account page should feel like a clean auth and access hub rather than a debug screen.

The language switcher should reuse the same locale options already used in appearance settings:

- English
- 中文

Changing language here should update the i18n context and locale cookie immediately.

## Chat Submit Interception

### Trigger point

Intercept unauthenticated submission in the chat-page submit handler rather than deep inside the prompt input primitive.

This keeps the prompt input generic and keeps auth policy at the page/application layer.

### Behavior

When the user submits while unauthenticated:

1. do not send the message
2. store the pending message in page state
3. open `LoginRequiredDialog`
4. after successful login, restore the message into the input
5. require the user to press send again

This matches the chosen behavior of preserving the message without auto-submitting it.

### Message restore

The restored message should include:

- text content
- attachments if the current prompt-input integration can safely restore them

If attachment restoration is not practical with the current prompt-input abstraction, restore text first and document attachments as a follow-up rather than guessing. The first implementation priority is preserving the drafted text.

## Local vs OIDC Behavior

### Local mode

`AuthPanel` should support:

- login tab
- register tab
- local inline validation
- local error display

### OIDC mode

`AuthPanel` should support:

- one primary sign-in button
- concise explanation of redirect-based sign-in

OIDC mode should not render local registration affordances.

## Error Handling

Expected UX behavior:

- local login/register failures stay inline within `AuthPanel`
- failed OIDC initiation shows a local error if initiation itself throws
- closing the login dialog does not clear the drafted chat message
- successful login clears dialog-local errors

The account page should remain useful even if BFF diagnostics fail to load.

## Testing

### Account page tests

Add coverage for:

- account page uses the refreshed product-facing structure
- account page exposes direct language switching
- auth panel and session card are separated conceptually

### Auth panel tests

Add coverage for:

- local mode shows login/register
- OIDC mode shows sign-in CTA
- language switcher is rendered
- successful auth can trigger `onSuccess`
- local validation and error rendering still work

### Chat auth interception tests

Add coverage for:

- unauthenticated submit opens login dialog
- drafted message is preserved
- successful login restores the message to the input
- restored message is not auto-submitted

### Regression coverage

Keep current tests for:

- local login
- local registration
- session normalization
- account page auth structure

## Future Work

Possible follow-ups after this slice:

- restore attachments as part of pending unauthenticated submits if current prompt-input APIs make that reliable
- add a more global auth-required modal policy for other protected actions
- further reduce technical diagnostics on the account page
- unify account-page language switching and settings-page appearance controls under a more explicit preferences model
