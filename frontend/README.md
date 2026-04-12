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

# The app will be available at http://localhost:3000
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

# Start production server
pnpm start
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
# LangGraph API URLs (optional, uses nginx proxy by default)
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
- sign in from `/workspace/account` with the seeded dev user `demo / demo123`

### Current BFF Dev Caveats

The main chat UI now uses the BFF conversation and streaming path, but not every runtime-facing
frontend dependency has been moved behind the BFF yet.

Current behavior:

- chat create/list/detail/stream goes through same-origin `/api/bff/*`
- browser auth state and `/me` also go through same-origin `/api/bff/*`
- model discovery now goes through same-origin `/api/bff/models`
- main chat artifact viewing/downloading now goes through same-origin `/api/bff/conversations/*/artifacts/*`
- main chat follow-up suggestions now go through same-origin `/api/bff/conversations/*/suggestions`
- main chat attachment uploads now go through same-origin `/api/bff/conversations/*/uploads`
- memory, MCP, skills, agents, and some non-chat runtime paths still use Gateway-facing paths

Current startup caveat:

- `make dev-pro` and `./scripts/serve.sh --dev --gateway` now start the FastAPI BFF on `:9000`
- the canonical gateway-mode local launcher is now aligned with the BFF-backed account and chat flows

Recommended local setup today:

- prefer same-origin proxying through `nginx` or the built-in Next.js rewrites
- do not point the browser directly at `http://127.0.0.1:8001` unless you also provide a matching
  reverse proxy or CORS layer

Canonical local entrypoints:

- `http://localhost:2026` through `nginx` is the most mature end-to-end dev entrypoint
- `http://localhost:3000` is usable for focused frontend work, but still depends on Next.js bridge
  routes and rewrites for some backend access

Why this matters:

- the gateway currently assumes CORS is handled by `nginx`
- direct browser requests to `8001` can succeed in `curl` but still fail in the browser
- the remaining direct Gateway dependencies make local behavior differ between `:3000` and `:2026`

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
| `pnpm build`        | Build for production                    |
| `pnpm start`        | Start production server                 |
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

## Auth Development

- `src/server/better-auth/` contains Better Auth implementation details and OIDC provider wiring.
- `src/core/auth/` is the stable frontend auth boundary for session state, provider config, and BFF request helpers.
- `src/core/auth/browser.ts` switches between live Better Auth behavior and a test-only browser mock adapter used by the auth E2E flow.
- `src/app/api/bff/me/route.ts` is the first authenticated bridge route from the frontend to the FastAPI BFF.
- `/api/bff/me` prefers `DEER_FLOW_INTERNAL_BFF_BASE_URL`, falls back to an absolute `NEXT_PUBLIC_BFF_BASE_URL`, and otherwise uses `http://127.0.0.1:9000`.
- `src/app/workspace/account/page.tsx` is the minimum proof page for browser OIDC login, session recovery, and authenticated BFF `/me`.
- `/workspace/account` is still an auth verification page for this slice; future product work should
  turn it into a real account page with clearer session state, connection health, and settings
  instead of exposing raw debug JSON as the primary UI.

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
- the BFF currently owns `create`, `list`, `detail`, and `messages/stream` for conversations

Current chat limitations:

- memory, MCP, skills, and agents still use Gateway-facing frontend APIs
- conversation rename/delete/archive actions are not yet exposed
- agent-specific chat paths still retain more legacy runtime semantics than the main chat path

Recommended next follow-up for the BFF chat path:

- migrate memory, MCP, skills, and agents behind BFF or same-origin server bridges
- turn `/workspace/account` from a verification screen into a product account/settings page
- reduce remaining frontend-visible gateway assumptions in direct `pnpm dev` flows

## Chat E2E

The frontend now includes a Playwright chat regression at `tests/e2e/chat.spec.ts`.

- `pnpm test:e2e:chat` runs the BFF-backed chat page against Chromium.
- The test mocks BFF conversation detail and stream responses to validate history hydrate, user send, tool progress rendering, and assistant completion.
- Together with `pnpm test:e2e:auth`, this covers the current main auth + chat product loop.

## License

MIT License. See [LICENSE](../LICENSE) for details.
