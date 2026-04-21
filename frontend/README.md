# DeerFlow Frontend

Like the original DeerFlow 1.0, we would love to give the community a minimalistic and easy-to-use web interface with a more modern and flexible architecture.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with [App Router](https://nextjs.org/docs/app)
- **UI**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/), [MagicUI](https://magicui.design/) and [React Bits](https://reactbits.dev/)
- **AI Integration**: [LangGraph SDK](https://www.npmjs.com/package/@langchain/langgraph-sdk) and [Vercel AI Elements](https://vercel.com/ai-sdk/ai-elements)

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.26.2+

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development server
pnpm dev

# Fallback only if you hit a Turbopack-specific regression
pnpm dev:webpack

# The app will be available at http://localhost:3000
```

For end-to-end local verification, prefer the root launcher and the nginx entrypoint:

```bash
cd ..
make dev-pro
# open http://localhost:2026
```

### Build

```bash
# Type check
pnpm typecheck

# Check formatting
pnpm format

# Apply formatting
pnpm format:write

# Lint
pnpm lint

# Build for production
pnpm build

# Start an existing production build
pnpm start

# Rebuild, then start
pnpm preview
```

## Site Map

```
├── /                             # Landing page
├── /workspace/chats              # Chat list
├── /workspace/chats/new          # New chat page
└── /workspace/chats/[conversation_id] # Main BFF-backed chat page
```

## Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Auth mode
NEXT_PUBLIC_AUTH_MODE="oidc"
# Backend API URLs (optional, uses nginx proxy by default)
NEXT_PUBLIC_BACKEND_BASE_URL="http://localhost:8001"
# LangGraph API URLs (optional, uses nginx proxy by default; root launchers
# rewrite frontend/.env.local automatically for gateway mode)
NEXT_PUBLIC_LANGGRAPH_BASE_URL="http://localhost:2024"
# Better Auth / OIDC configuration
BETTER_AUTH_OIDC_CLIENT_ID="oidc-client-id"
BETTER_AUTH_OIDC_CLIENT_SECRET="oidc-client-secret"
BETTER_AUTH_OIDC_DISCOVERY_URL="https://issuer.example.com/.well-known/openid-configuration"
NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID="oidc"
# Public BFF base URL used by browser code
NEXT_PUBLIC_BFF_BASE_URL="/api/bff"
# Internal BFF base URL used by Next.js server routes
DEER_FLOW_INTERNAL_BFF_BASE_URL="http://127.0.0.1:9000"
```

For local OIDC development you typically need all of the following aligned:

- `BETTER_AUTH_URL` pointing at the frontend origin handling the callback, such as `http://localhost:3000`
- `BETTER_AUTH_OIDC_CLIENT_ID`, `BETTER_AUTH_OIDC_CLIENT_SECRET`, and `BETTER_AUTH_OIDC_DISCOVERY_URL`
- a running FastAPI BFF reachable from the Next.js server, usually through `DEER_FLOW_INTERNAL_BFF_BASE_URL`
- `NEXT_PUBLIC_BFF_BASE_URL` only when browser requests should use something other than the default same-origin `/api/bff` bridge

For local development without OIDC, use the BFF local auth provider instead:

- set `NEXT_PUBLIC_AUTH_MODE=local` in `frontend/.env`
- set `DEER_FLOW_INTERNAL_BFF_BASE_URL=http://127.0.0.1:9000`
- keep `BFF_AUTH_PROVIDER=local` in `bff/.env`
- sign in from `/workspace/account` with the seeded dev user `demo / demo1234`
- or create a new local account from `/workspace/account`
- local registration supports username/password only in this slice
- email verification and password reset remain future work
- local auth now relies on the HttpOnly BFF auth cookie for same-origin `/api/bff/*`
  requests; the frontend no longer stores the raw BFF bearer token in
  `localStorage`

### Current Runtime Boundary

The frontend now has a clearer same-origin split between the BFF-backed chat/account flow and a
smaller set of remaining Gateway-backed workspace surfaces.

Current same-origin browser behavior:

- chat create/list/detail/stream goes through `/api/bff/*`
- browser auth state and `/me` go through `/api/bff/*`
- model discovery goes through `/api/bff/models`
- main chat artifact viewing/downloading goes through `/api/bff/conversations/*/artifacts/*`
- main chat follow-up suggestions go through `/api/bff/conversations/*/suggestions`
- main chat attachment uploads go through `/api/bff/conversations/*/uploads`
- MCP, skills, and agents go through same-origin Next.js bridge routes
- `/workspace/account` is now a product-facing account/status page with a shared auth panel, session diagnostics, and unauthenticated chat recovery

What still remains mixed:

- some older non-chat runtime surfaces still use Gateway-facing thread semantics behind server bridges
- direct `:3000` development still behaves differently from the canonical `:2026` nginx entrypoint
- MCP, skills, and agents are same-origin, but not yet BFF-owned APIs

Current startup story:

- `make dev-pro` and `./scripts/serve.sh --dev --gateway` start `Gateway + BFF + Frontend + nginx`
- `make start` / `make start-pro` reuse an up-to-date local production build and rebuild once only when the frontend sources are newer or no build exists
- `http://localhost:2026` is the canonical end-to-end local entrypoint
- `http://localhost:3000` remains useful for focused frontend work, but it is still a partial-bridge workflow

Current nginx ownership:

- browser-visible `/api/models`, `/api/mcp`, `/api/skills`, `/api/agents`, and `/api/threads/*`
  now fall through to `frontend`
- Next.js same-origin route handlers own those browser entrypoints
- direct browser access to `http://127.0.0.1:8001` is still non-canonical because the gateway expects
  CORS to be handled by `nginx`

Canonical BFF chat routes:

- `/workspace/chats/new` is the canonical new-chat route
- `/workspace/chat/new` is only kept as a compatibility alias

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   ├── workspace/          # Main workspace pages
│   └── mock/               # Mock/demo pages
├── components/             # React components
│   ├── ui/                 # Reusable UI components
│   ├── workspace/          # Workspace-specific components
│   ├── landing/            # Landing page components
│   └── ai-elements/        # AI-related UI elements
├── core/                   # Core business logic
│   ├── api/                # API client & data fetching
│   ├── artifacts/          # Artifact management
│   ├── auth/               # Reusable auth boundary for session and BFF bridge
│   ├── bff-chat/           # BFF-owned chat boundary for conversations and stream events
│   ├── config/              # App configuration
│   ├── i18n/               # Internationalization
│   ├── mcp/                # MCP integration
│   ├── messages/           # Message handling
│   ├── models/             # Data models & types
│   ├── settings/           # User settings
│   ├── skills/             # Skills system
│   ├── threads/            # Thread management
│   ├── todos/              # Todo system
│   └── utils/              # Utility functions
├── hooks/                  # Custom React hooks
├── lib/                    # Shared libraries & utilities
├── server/                 # Server-side code
│   └── better-auth/        # Authentication setup and session helpers
└── styles/                 # Global styles
```

## Scripts

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Start development server with Turbopack |
| `pnpm dev:webpack`  | Start development server with webpack fallback |
| `pnpm build`        | Build for production                    |
| `pnpm start`        | Start an existing production build      |
| `pnpm preview`      | Rebuild, then start the production server |
| `pnpm format`       | Check formatting with Prettier          |
| `pnpm format:write` | Apply formatting with Prettier          |
| `pnpm lint`         | Run ESLint                              |
| `pnpm lint:fix`     | Fix ESLint issues                       |
| `pnpm typecheck`    | Run TypeScript type checking            |
| `pnpm check`        | Run both lint and typecheck             |
| `pnpm test:e2e:auth` | Run the auth Playwright regression      |
| `pnpm test:e2e:chat` | Run the chat Playwright regression      |

## Development Notes

- Uses pnpm workspaces (see `packageManager` in package.json)
- Turbopack enabled by default in development for faster builds
- Environment validation can be skipped with `SKIP_ENV_VALIDATION=1` (useful for Docker)
- Backend API URLs are optional; nginx proxy is used by default in development
- Root `make start*` launchers now behave like production starters: they reuse a fresh `.next` build when possible and rebuild lazily when the local frontend sources changed

## Auth Development

- `src/server/better-auth/` contains Better Auth implementation details and OIDC provider wiring.
- `src/core/auth/` is the stable frontend auth boundary for session state, provider config, and BFF request helpers.
- In `NEXT_PUBLIC_AUTH_MODE=local`, login and registration set an HttpOnly cookie and only persist the synthetic browser session; raw BFF access tokens must not be exposed to browser JS or custom auth headers.
- `src/core/auth/browser.ts` switches between live Better Auth behavior and a test-only browser mock adapter used by the auth E2E flow.
- `src/app/api/bff/me/route.ts` is the first authenticated bridge route from the frontend to the FastAPI BFF.
- `/api/bff/me` prefers `DEER_FLOW_INTERNAL_BFF_BASE_URL`, falls back to an absolute `NEXT_PUBLIC_BFF_BASE_URL`, and otherwise uses `http://127.0.0.1:9000`.
- `src/app/workspace/account/page.tsx` is the product-facing account surface for sign-in, local registration, session health, and authenticated BFF `/me`.
- `src/components/auth/auth-panel.tsx` is the shared auth surface used by both `/workspace/account` and the login-required chat dialog.
- unauthenticated chat sends now open a reusable login dialog and preserve the drafted message text for explicit resend after login.
- language switching stays centralized in `Settings > Appearance`; `/workspace/account` no longer hosts a separate locale selector.

## Auth E2E

The frontend now includes a Playwright auth regression at `tests/e2e/auth.spec.ts`.

- `pnpm test:e2e:auth` runs the `/workspace/account` auth flow against Chromium.
- The test uses `NEXT_PUBLIC_AUTH_E2E_MOCK=1` to swap browser login/logout/session restore onto a test-only mock adapter while still exercising the real page and the same-origin `/api/bff/me` fetch path.
- In normal development and production, auth continues to use Better Auth directly.

## Chat Development

The main workspace chat path now uses a BFF-owned protocol rather than frontend-visible runtime thread semantics.

- `src/core/bff-chat/` owns conversation API calls, stream parsing, and frontend chat state updates.
- `src/app/api/bff/conversations/` contains the same-origin bridge routes from the browser to the FastAPI BFF.
- `src/app/workspace/chats/[conversation_id]/` is the main BFF-backed chat route.
- the BFF currently owns `create`, `list`, `detail`, `rename`, `pin`, `delete`, and `messages/stream` for conversations

Current chat limitations:

- MCP, skills, and agents are same-origin server bridges today, not BFF-owned APIs
- recent conversations now expose sidebar pin/rename/delete actions through the BFF-backed chat path
- agent-specific chat paths still retain more legacy runtime semantics than the main chat path

Recommended next follow-up for the BFF chat path:

- decide which MCP, skills, and agents paths should move from same-origin bridges into BFF ownership
- decide whether more protected workspace actions should reuse the login-required dialog pattern
- reduce remaining frontend-visible gateway assumptions in direct `pnpm dev` flows

## Chat E2E

The frontend now includes a Playwright chat regression at `tests/e2e/chat.spec.ts`.

- `pnpm test:e2e:chat` runs the BFF-backed chat page against Chromium.
- The test mocks BFF conversation detail and stream responses to validate history hydrate, user send, tool progress rendering, and assistant completion.
- Together with `pnpm test:e2e:auth`, this covers the current main auth + chat product loop.

## License

MIT License. See [LICENSE](../LICENSE) for details.
