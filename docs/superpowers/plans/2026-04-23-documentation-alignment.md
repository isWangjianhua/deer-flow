# Documentation Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the current DeerFlow entry docs in place so the root READMEs, service READMEs, service doc indexes, and the backend/BFF core architecture/API docs all describe the same current three-service reality without changing the existing documentation layout.

**Architecture:** Treat `README.md` as the canonical root narrative, then mirror only the shared architecture/startup/docs-navigation facts into the localized READMEs. Keep the existing documentation topology intact while tightening each service entry doc around a common structure: what this layer is, what it owns, what it does not own, how to start it, and what to read next. Finish by aligning the backend and BFF technical docs to the current code paths, especially Gateway thread-based/stateless runs and BFF ownership-aware product APIs.

**Tech Stack:** Markdown, MDX/Nextra, FastAPI service docs, Next.js docs content, `rg`, `git diff --check`, `pnpm build`

---

## File Map

- `README.md`
  - Canonical root README for repo-level positioning, startup guidance, and docs entry links.
- `README_zh.md`
  - Chinese root README; should mirror the canonical architecture/startup/docs navigation in Chinese.
- `README_ja.md`
  - Japanese root README; should mirror the canonical architecture/startup/docs navigation in Japanese.
- `README_fr.md`
  - French root README; should mirror the canonical architecture/startup/docs navigation in French.
- `README_ru.md`
  - Russian root README; should mirror the canonical architecture/startup/docs navigation in Russian.
- `backend/README.md`
  - Backend service README explaining Harness vs Gateway and current runtime surfaces.
- `backend/docs/README.md`
  - Backend docs index pointing readers to the right current-source-of-truth docs.
- `backend/docs/ARCHITECTURE.md`
  - Backend architecture truth for topology, boundaries, and run surfaces.
- `backend/docs/API.md`
  - Backend API truth for Gateway routes, especially thread-based vs stateless runs.
- `bff/README.md`
  - BFF service README explaining `conversation_id`, ownership, agents, and resource proxying.
- `bff/docs/README.md`
  - BFF docs index highlighting the BFF as the product-facing contract layer.
- `bff/docs/ARCHITECTURE.md`
  - BFF architecture truth for auth, conversation mapping, agent visibility, and boundary ownership.
- `bff/docs/API.md`
  - BFF API truth for `/agents*`, `/conversations*`, `/memory`, and related product routes.
- `frontend/README.md`
  - Frontend service README explaining the product UI, same-origin bridge role, and docs-site relationship.
- `frontend/src/content/en/index.mdx`
  - Docs-site home page that should describe Harness vs App with the current repo boundary.
- `frontend/src/content/en/application/index.mdx`
  - Application docs landing page that should describe the BFF-first app path.
- `frontend/src/content/en/reference/source-map.mdx`
  - Code-oriented ownership map linking frontend, BFF, and backend directories to their responsibilities.

### Task 1: Refresh the canonical English root README

**Files:**
- Modify: `README.md`
- Test: `README.md`

- [ ] **Step 1: Capture the current root README gaps with grep assertions**

Run:

```bash
rg -n 'Browser -> nginx|conversation_id|thread_id|BFF-first|frontend/src/content/en/index.mdx' README.md
rg -n '/api/runs/stream|/api/threads/\\{thread_id\\}/runs' README.md
```

Expected:

- the first command returns no matches for the missing architecture/docs-navigation terms
- the second command returns no matches because the current root README does not describe Gateway run surfaces directly

- [ ] **Step 2: Add a compact repo-level architecture section to `README.md`**

Insert a new section after the quick-start launch guidance and before the long feature deep dive using this structure:

```md
## Current Architecture

DeerFlow 2.0 currently runs as a three-service application:

- `frontend/` - the Next.js product UI and the docs site
- `bff/` - the FastAPI backend-for-frontend that owns `conversation_id`, auth, and product-facing chat contracts
- `backend/` - the FastAPI Gateway plus the reusable Harness runtime, which still reasons in `thread_id`

Canonical local path:

```text
Browser -> nginx :2026 -> frontend :3000 -> /api/bff/* -> BFF :9000 -> Gateway/Harness
```

Two local launch modes matter today:

- `make dev` - standard mode with the dedicated LangGraph server
- `make dev-pro` - gateway mode where Gateway exposes the LangGraph-compatible runtime surface itself
```

- [ ] **Step 3: Replace the root documentation navigation with a service-aware map**

Rewrite the root documentation section so it points readers at the real current entry docs:

```md
## Documentation

Use the documentation in this order if you are orienting yourself in the current repository:

- docs-site overview: `frontend/src/content/en/index.mdx`
- backend service entry: `backend/README.md`
- BFF service entry: `bff/README.md`
- frontend service entry: `frontend/README.md`
- backend architecture and API: `backend/docs/ARCHITECTURE.md`, `backend/docs/API.md`
- BFF architecture and API: `bff/docs/ARCHITECTURE.md`, `bff/docs/API.md`

The frontend docs site is the main product/harness guide, while the service READMEs and `docs/*` files remain the maintainer-facing source of truth for the code in this fork.
```

- [ ] **Step 4: Re-run the README assertions to verify the new narrative exists**

Run:

```bash
rg -n 'Current Architecture|conversation_id|thread_id|make dev-pro|frontend/src/content/en/index.mdx' README.md
```

Expected: matches for the new architecture section, the runtime identifiers, and the docs-site entry path.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: refresh root readme architecture"
```

### Task 2: Sync the localized root READMEs to the canonical structure

**Files:**
- Modify: `README_zh.md`
- Modify: `README_ja.md`
- Modify: `README_fr.md`
- Modify: `README_ru.md`
- Test: `README_zh.md`
- Test: `README_ja.md`
- Test: `README_fr.md`
- Test: `README_ru.md`

- [ ] **Step 1: Prove the localized READMEs are missing the shared architecture markers**

Run:

```bash
rg -n 'conversation_id|thread_id|frontend/src/content/en/index.mdx|make dev-pro' README_zh.md README_ja.md README_fr.md README_ru.md
```

Expected: few or no matches, showing the shared architecture/docs-navigation facts still need to be aligned.

- [ ] **Step 2: Add the Chinese architecture and docs-navigation section**

Insert this block into `README_zh.md` near the repo-level overview/docs area:

```md
## 当前架构

DeerFlow 2.0 当前主要由 3 个服务组成：

- `frontend/`：Next.js 产品前端和文档站
- `bff/`：面向浏览器的 FastAPI BFF，负责 `conversation_id`、认证和产品 API 合约
- `backend/`：Gateway 与可复用 Harness runtime，内部仍以 `thread_id` 为运行时主标识

本地 canonical 路径：

```text
Browser -> nginx :2026 -> frontend :3000 -> /api/bff/* -> BFF :9000 -> Gateway/Harness
```

推荐启动方式：

- `make dev`：standard mode，保留独立 LangGraph server
- `make dev-pro`：gateway mode，由 Gateway 暴露兼容运行面

## 文档导航

- 仓库入口：`README.md`、`Install.md`
- 服务入口：`backend/README.md`、`bff/README.md`、`frontend/README.md`
- 前端文档站入口：`frontend/src/content/en/index.mdx`
- 核心架构/API：`backend/docs/ARCHITECTURE.md`、`backend/docs/API.md`、`bff/docs/ARCHITECTURE.md`、`bff/docs/API.md`
```

- [ ] **Step 3: Add the Japanese architecture and docs-navigation section**

Insert this block into `README_ja.md` near the repo-level overview/docs area:

```md
## 現在のアーキテクチャ

DeerFlow 2.0 は現在 3 つのサービスで動作しています。

- `frontend/` - Next.js 製のプロダクト UI とドキュメントサイト
- `bff/` - `conversation_id`、認証、プロダクト向け API 契約を担う FastAPI BFF
- `backend/` - Gateway と再利用可能な Harness runtime。内部の実行時主キーは引き続き `thread_id`

ローカルの canonical パス：

```text
Browser -> nginx :2026 -> frontend :3000 -> /api/bff/* -> BFF :9000 -> Gateway/Harness
```

主な起動モード：

- `make dev` - standard mode。専用の LangGraph server を使用
- `make dev-pro` - gateway mode。Gateway が互換ランタイム面を直接公開

## ドキュメント案内

- リポジトリ入口：`README.md`、`Install.md`
- サービス入口：`backend/README.md`、`bff/README.md`、`frontend/README.md`
- フロントエンドの docs-site 入口：`frontend/src/content/en/index.mdx`
- 主要な architecture/API：`backend/docs/ARCHITECTURE.md`、`backend/docs/API.md`、`bff/docs/ARCHITECTURE.md`、`bff/docs/API.md`
```

- [ ] **Step 4: Add the French architecture and docs-navigation section**

Insert this block into `README_fr.md` near the repo-level overview/docs area:

```md
## Architecture actuelle

DeerFlow 2.0 fonctionne aujourd'hui comme une application a trois services :

- `frontend/` - l'interface produit Next.js et le site de documentation
- `bff/` - le BFF FastAPI qui possede `conversation_id`, l'authentification et les contrats API orientes produit
- `backend/` - le Gateway FastAPI et le runtime Harness reutilisable, qui raisonne encore en `thread_id`

Chemin local canonique :

```text
Browser -> nginx :2026 -> frontend :3000 -> /api/bff/* -> BFF :9000 -> Gateway/Harness
```

Modes de lancement utiles :

- `make dev` - standard mode avec un serveur LangGraph dedie
- `make dev-pro` - gateway mode ou le Gateway expose directement la surface runtime compatible

## Parcours documentation

- entree depot : `README.md`, `Install.md`
- entrees service : `backend/README.md`, `bff/README.md`, `frontend/README.md`
- entree docs-site frontend : `frontend/src/content/en/index.mdx`
- architecture/API principales : `backend/docs/ARCHITECTURE.md`, `backend/docs/API.md`, `bff/docs/ARCHITECTURE.md`, `bff/docs/API.md`
```

- [ ] **Step 5: Add the Russian architecture and docs-navigation section**

Insert this block into `README_ru.md` near the repo-level overview/docs area:

```md
## Текущая архитектура

Сейчас DeerFlow 2.0 разворачивается как приложение из трех сервисов:

- `frontend/` - продуктовый интерфейс на Next.js и сайт документации
- `bff/` - FastAPI BFF, который владеет `conversation_id`, аутентификацией и браузерным API-контрактом
- `backend/` - Gateway и переиспользуемый Harness runtime, где внутренним идентификатором выполнения по-прежнему остается `thread_id`

Канонический локальный путь:

```text
Browser -> nginx :2026 -> frontend :3000 -> /api/bff/* -> BFF :9000 -> Gateway/Harness
```

Основные режимы запуска:

- `make dev` - standard mode с отдельным LangGraph server
- `make dev-pro` - gateway mode, где совместимую runtime-поверхность отдает сам Gateway

## Навигация по документации

- вход в репозиторий: `README.md`, `Install.md`
- входы по сервисам: `backend/README.md`, `bff/README.md`, `frontend/README.md`
- вход в docs-site фронтенда: `frontend/src/content/en/index.mdx`
- ключевые architecture/API документы: `backend/docs/ARCHITECTURE.md`, `backend/docs/API.md`, `bff/docs/ARCHITECTURE.md`, `bff/docs/API.md`
```

- [ ] **Step 6: Re-run the localization assertions**

Run:

```bash
rg -n 'conversation_id|thread_id|frontend/src/content/en/index.mdx|make dev-pro' README_zh.md README_ja.md README_fr.md README_ru.md
```

Expected: matches in all four files for the shared runtime identifiers, docs-site path, and gateway mode command.

- [ ] **Step 7: Commit**

```bash
git add README_zh.md README_ja.md README_fr.md README_ru.md
git commit -m "docs: sync localized readmes with current architecture"
```

### Task 3: Align the backend and BFF service entry docs

**Files:**
- Modify: `backend/README.md`
- Modify: `backend/docs/README.md`
- Modify: `bff/README.md`
- Modify: `bff/docs/README.md`
- Test: `backend/README.md`
- Test: `backend/docs/README.md`
- Test: `bff/README.md`
- Test: `bff/docs/README.md`

- [ ] **Step 1: Capture the current service-doc gaps**

Run:

```bash
rg -n '/api/runs/stream|stateless runs|thread-based runs|conversation_id' backend/README.md backend/docs/README.md
rg -n '/agents\\*|agent ownership|conversation_id -> deerflow_thread_id|POST /agents/\\{agent_name\\}/conversations' bff/README.md bff/docs/README.md
```

Expected:

- backend matches are partial and do not clearly describe both run surfaces
- BFF matches are partial and do not clearly present the full current browser-facing ownership boundary

- [ ] **Step 2: Tighten the backend README around current runtime boundaries**

Update `backend/README.md` so the opening sections include this compact responsibility block:

```md
## What This Layer Owns

- the reusable Harness runtime in `backend/packages/harness/deerflow/`
- the FastAPI Gateway in `backend/app/gateway/`
- IM channel integrations in `backend/app/channels/`
- LangGraph-compatible runtime routes for threads and runs

## Current Runtime Surfaces

Gateway currently exposes two compatible run surfaces:

- thread-based runs: `/api/threads/{thread_id}/runs*`
- stateless runs: `/api/runs/{stream,wait}`

The stateless routes still resolve a `thread_id` internally. They reuse `config.configurable.thread_id` when present, or generate a fresh thread automatically otherwise.
```

- [ ] **Step 3: Rework the backend docs index so readers start with current truth**

Update `backend/docs/README.md` with this reading-order language:

```md
## Start Here

Use these files as the current source of truth:

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API.md`
4. `CONFIGURATION.md`
5. `SETUP.md`

Historical RFCs and implementation notes in this directory are still useful context, but they should not override the four entry documents above when the repository code has moved on.
```

- [ ] **Step 4: Tighten the BFF README and docs index around ownership-aware product APIs**

Update `bff/README.md` with this current-boundary block:

```md
## Current Product Boundary

The BFF owns the browser-facing contract for:

- auth and current-user resolution
- `conversation_id -> deerflow_thread_id` mapping
- conversation ownership checks
- browser-facing chat streaming and resource proxying
- readonly lead-agent memory reads
- `/agents*` CRUD routes and user-scoped agent visibility
- `POST /agents/{agent_name}/conversations` for BFF-owned agent chat bootstrap

The BFF does not own DeerFlow runtime internals, raw `thread_id` as a browser contract, or MCP/skills product APIs.
```

Update `bff/docs/README.md` with this reading-order block:

```md
## Recommended Reading Order

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API.md`
4. `DEVELOPMENT.md`
5. `ROADMAP.md`

Treat `README.md`, `ARCHITECTURE.md`, and `API.md` as the current-source-of-truth trio for the BFF boundary. The roadmap remains useful historical context, but it should not outrank the implemented route/docs pair.
```

- [ ] **Step 5: Re-run the service-doc assertions**

Run:

```bash
rg -n '/api/runs/stream|stateless runs|thread-based runs|conversation_id' backend/README.md backend/docs/README.md
rg -n '/agents\\*|agent visibility|conversation_id -> deerflow_thread_id|POST /agents/\\{agent_name\\}/conversations' bff/README.md bff/docs/README.md
```

Expected: the backend files now mention both run surfaces, and the BFF files now mention conversation mapping, agent visibility, and agent-conversation bootstrap.

- [ ] **Step 6: Commit**

```bash
git add backend/README.md backend/docs/README.md bff/README.md bff/docs/README.md
git commit -m "docs: align service entry documentation"
```

### Task 4: Refresh the frontend service README and docs-site entry pages

**Files:**
- Modify: `frontend/README.md`
- Modify: `frontend/src/content/en/index.mdx`
- Modify: `frontend/src/content/en/application/index.mdx`
- Modify: `frontend/src/content/en/reference/source-map.mdx`
- Test: `frontend/README.md`
- Test: `frontend/src/content/en/index.mdx`
- Test: `frontend/src/content/en/application/index.mdx`
- Test: `frontend/src/content/en/reference/source-map.mdx`

- [ ] **Step 1: Capture the frontend documentation gaps**

Run:

```bash
rg -n 'README \\+ docs|src/content/en|src/content/zh|BFF-first|conversation_id|thread_id' frontend/README.md frontend/src/content/en/index.mdx frontend/src/content/en/application/index.mdx frontend/src/content/en/reference/source-map.mdx
```

Expected: the current files mention pieces of the architecture, but do not yet clearly spell out the `README + docs-site` split or the BFF-first product path in a single consistent voice.

- [ ] **Step 2: Add a docs-shape section to `frontend/README.md`**

Update `frontend/README.md` with this section near the current runtime-boundary explanation:

```md
## Documentation Shape

Frontend documentation currently lives in two layers:

- `frontend/README.md` for service onboarding and local-development boundaries
- `frontend/src/content/en/*` for the main docs-site content
- `frontend/src/content/zh/*` for a much smaller Chinese subset

If you are updating the user-facing docs narrative, change the docs-site pages. If you are onboarding a maintainer to the frontend service itself, start here.
```

Also tighten the current-boundary wording so it explicitly says the product path is BFF-first and `conversation_id` is the browser-visible main-chat identifier.

- [ ] **Step 3: Refresh `frontend/src/content/en/index.mdx` to point at the current repo boundaries**

Update the docs home page with this additional positioning language:

```md
DeerFlow in this repository is best understood as three collaborating layers:

- the `frontend/` Next.js application
- the `bff/` FastAPI product boundary
- the `backend/` Gateway plus Harness runtime

The docs site explains the Harness and App concepts, while the service READMEs explain how those concepts map onto the code in this fork.
```

- [ ] **Step 4: Refresh `frontend/src/content/en/application/index.mdx` and `frontend/src/content/en/reference/source-map.mdx`**

Update `frontend/src/content/en/application/index.mdx` with this current-product-boundary text:

```md
Today the application path is BFF-first for the main chat, account, memory, and browser-facing agent flows. The browser should think in `conversation_id`, while the Gateway and Harness runtime still reason in `thread_id` behind the BFF boundary.
```

Update `frontend/src/content/en/reference/source-map.mdx` so the ownership map says:

```md
### Frontend

- `frontend/src/app/api/bff/`
  - same-origin BFF bridge for browser-visible BFF routes
- `frontend/src/core/bff-chat/`
  - BFF conversation state, stream events, and `conversation_id`-oriented chat flows
- `frontend/src/core/threads/`
  - remaining thread-oriented compatibility helpers for older Gateway-facing paths

### BFF

- `bff/app/api/routes/`
  - product-facing auth, agent, conversation, memory, and resource routes
- `bff/app/services/`
  - ownership checks, conversation mapping, and downstream DeerFlow orchestration

### Backend

- `backend/app/gateway/routers/`
  - Gateway REST routes, including thread-based runs and stateless runs
- `backend/packages/harness/deerflow/runtime/`
  - reusable runtime execution and stream plumbing
```

- [ ] **Step 5: Re-run the frontend docs assertions**

Run:

```bash
rg -n 'src/content/en|src/content/zh|BFF-first|conversation_id|thread_id|stateless runs' frontend/README.md frontend/src/content/en/index.mdx frontend/src/content/en/application/index.mdx frontend/src/content/en/reference/source-map.mdx
```

Expected: all files now mention the docs split and the current BFF-first/browser-`conversation_id` boundary.

- [ ] **Step 6: Commit**

```bash
git add frontend/README.md frontend/src/content/en/index.mdx frontend/src/content/en/application/index.mdx frontend/src/content/en/reference/source-map.mdx
git commit -m "docs: align frontend entry documentation"
```

### Task 5: Align the backend architecture and API docs with the actual Gateway code paths

**Files:**
- Modify: `backend/docs/ARCHITECTURE.md`
- Modify: `backend/docs/API.md`
- Test: `backend/docs/ARCHITECTURE.md`
- Test: `backend/docs/API.md`

- [ ] **Step 1: Prove the backend technical docs still under-describe the current run surfaces**

Run:

```bash
rg -n '/api/runs/stream|/api/runs/wait|stateless runs|Content-Location|on_completion' backend/docs/ARCHITECTURE.md backend/docs/API.md
```

Expected: the docs mention some compatibility routing, but they do not yet cleanly enumerate the stateless run routes and their behavior.

- [ ] **Step 2: Add an explicit run-surfaces section to `backend/docs/ARCHITECTURE.md`**

Insert this block after the Gateway responsibilities section:

```md
## Gateway Run Surfaces

Gateway currently exposes two compatible run surfaces.

### Thread-based runs

- `POST /api/threads/{thread_id}/runs`
- `POST /api/threads/{thread_id}/runs/stream`
- `POST /api/threads/{thread_id}/runs/wait`
- `GET /api/threads/{thread_id}/runs`
- `GET /api/threads/{thread_id}/runs/{run_id}`

### Stateless runs

- `POST /api/runs/stream`
- `POST /api/runs/wait`

The stateless routes are "stateless" only from the browser/client point of view. Internally they still resolve a `thread_id`: they reuse `config.configurable.thread_id` when present, or generate a new thread automatically when it is absent.
```

- [ ] **Step 3: Expand `backend/docs/API.md` with a route table for both run families**

Add or replace the run-lifecycle section with this route summary:

```md
## Runs

### Thread-based runs

| Route | Purpose |
| --- | --- |
| `POST /api/threads/{thread_id}/runs` | create a background run |
| `POST /api/threads/{thread_id}/runs/stream` | create a run and stream SSE events |
| `POST /api/threads/{thread_id}/runs/wait` | create a run and return the final state |
| `GET /api/threads/{thread_id}/runs` | list runs for a thread |
| `GET /api/threads/{thread_id}/runs/{run_id}` | inspect one run |
| `POST /api/threads/{thread_id}/runs/{run_id}/cancel` | cancel a run |
| `GET|POST /api/threads/{thread_id}/runs/{run_id}/stream` | join or cancel-then-join a run stream |

### Stateless runs

| Route | Purpose |
| --- | --- |
| `POST /api/runs/stream` | auto-resolve a thread and stream SSE events |
| `POST /api/runs/wait` | auto-resolve a thread and return final state |

The SSE endpoints return `Content-Location` headers pointing at the canonical thread-based run resource. This is what lets LangGraph-compatible clients recover the created `run_id` even when the request starts from a stream endpoint.
```

- [ ] **Step 4: Re-run the backend technical-doc assertions**

Run:

```bash
rg -n '/api/runs/stream|/api/runs/wait|stateless runs|Content-Location|on_completion' backend/docs/ARCHITECTURE.md backend/docs/API.md
```

Expected: the architecture and API docs now both mention the stateless run family and the canonical `Content-Location` behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/docs/ARCHITECTURE.md backend/docs/API.md
git commit -m "docs: align backend runtime documentation"
```

### Task 6: Align the BFF architecture and API docs with the implemented product boundary

**Files:**
- Modify: `bff/docs/ARCHITECTURE.md`
- Modify: `bff/docs/API.md`
- Test: `bff/docs/ARCHITECTURE.md`
- Test: `bff/docs/API.md`

- [ ] **Step 1: Prove the BFF technical docs still lag behind the current browser-facing routes**

Run:

```bash
rg -n '/agents\\*|POST /agents/\\{agent_name\\}/conversations|agent visibility|readonly lead-agent memory|conversation_id -> deerflow_thread_id' bff/docs/ARCHITECTURE.md bff/docs/API.md
```

Expected: some terms are present, but the docs still understate that the BFF now owns browser-facing agent CRUD and agent-conversation bootstrap.

- [ ] **Step 2: Update `bff/docs/ARCHITECTURE.md` with the current boundary shape**

Replace the outdated "What is true today" section with this wording:

```md
## Current Boundary Shape

What is true today:

- the main chat route is BFF-backed
- `/workspace/account` is BFF-backed
- model discovery is BFF-backed
- readonly lead-agent memory is BFF-backed
- browser-facing `/agents*` CRUD is BFF-backed
- `POST /agents/{agent_name}/conversations` is BFF-backed
- any conversation carrying `agent_name` must pass both conversation ownership checks and agent-visibility checks before detail, delete, or stream access is allowed
- MCP and skills still remain frontend bridge routes to Gateway-facing APIs
```

- [ ] **Step 3: Expand `bff/docs/API.md` so the public route map matches the code**

Add or replace the public-route summary with this table:

```md
## Public Routes

| Route | Purpose |
| --- | --- |
| `POST /auth/login` | local login |
| `POST /auth/register` | local registration |
| `GET /me` | current user |
| `GET /models` | model list for the frontend |
| `GET /memory` | readonly lead-agent memory for the current user |
| `GET /agents` | list browser-facing agents visible to the current user |
| `GET /agents/check?name=...` | validate agent-name availability |
| `GET /agents/{agent_name}` | load one visible agent |
| `POST /agents` | create an agent through the BFF |
| `PUT /agents/{agent_name}` | update a visible agent |
| `DELETE /agents/{agent_name}` | delete a visible agent |
| `POST /agents/{agent_name}/conversations` | create a BFF conversation scoped to that agent |
| `POST /conversations` | create a main-chat conversation |
| `GET /conversations` | list visible conversations |
| `GET /conversations/{conversation_id}` | load conversation detail |
| `PATCH /conversations/{conversation_id}` | rename, pin, or unpin a conversation |
| `DELETE /conversations/{conversation_id}` | delete a conversation and its mapped DeerFlow thread |
| `POST /conversations/{conversation_id}/messages/stream` | stream chat events for an owned conversation |
| `POST /conversations/{conversation_id}/suggestions` | generate follow-up suggestions |
| `GET /conversations/{conversation_id}/artifacts/{path}` | download an artifact |
| `POST /conversations/{conversation_id}/uploads` | upload a file |
| `GET /conversations/{conversation_id}/uploads` | list uploads |
| `DELETE /conversations/{conversation_id}/uploads/{filename}` | delete an uploaded file |
```

Immediately under the table, add this note:

```md
When a stored conversation carries `agent_name`, the BFF injects that value into DeerFlow runtime context during streaming and also enforces that the current user still has visibility to that agent before allowing detail, delete, or stream access.
```

- [ ] **Step 4: Re-run the BFF technical-doc assertions**

Run:

```bash
rg -n '/agents\\*|POST /agents/\\{agent_name\\}/conversations|agent-visibility checks|readonly lead-agent memory|conversation_id -> deerflow_thread_id' bff/docs/ARCHITECTURE.md bff/docs/API.md
```

Expected: the docs now clearly expose the current BFF boundary, including agent CRUD, agent-conversation bootstrap, memory scope, and ownership-aware access.

- [ ] **Step 5: Commit**

```bash
git add bff/docs/ARCHITECTURE.md bff/docs/API.md
git commit -m "docs: align bff product documentation"
```

### Task 7: Run the documentation verification sweep

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `README_ja.md`
- Modify: `README_fr.md`
- Modify: `README_ru.md`
- Modify: `backend/README.md`
- Modify: `backend/docs/README.md`
- Modify: `backend/docs/ARCHITECTURE.md`
- Modify: `backend/docs/API.md`
- Modify: `bff/README.md`
- Modify: `bff/docs/README.md`
- Modify: `bff/docs/ARCHITECTURE.md`
- Modify: `bff/docs/API.md`
- Modify: `frontend/README.md`
- Modify: `frontend/src/content/en/index.mdx`
- Modify: `frontend/src/content/en/application/index.mdx`
- Modify: `frontend/src/content/en/reference/source-map.mdx`
- Test: `frontend/package.json`

- [ ] **Step 1: Run a cross-doc terminology check**

Run:

```bash
rg -n 'conversation_id|thread_id|make dev-pro|frontend/src/content/en/index.mdx|/api/runs/stream|POST /agents/\\{agent_name\\}/conversations' README.md README_zh.md README_ja.md README_fr.md README_ru.md backend/README.md backend/docs/README.md backend/docs/ARCHITECTURE.md backend/docs/API.md bff/README.md bff/docs/README.md bff/docs/ARCHITECTURE.md bff/docs/API.md frontend/README.md frontend/src/content/en/index.mdx frontend/src/content/en/application/index.mdx frontend/src/content/en/reference/source-map.mdx
```

Expected: the shared runtime identifiers, launch command, docs-site path, stateless run route, and agent-conversation route all appear across the intended entry docs.

- [ ] **Step 2: Run whitespace and patch-integrity checks**

Run:

```bash
git diff --check
```

Expected: no trailing-whitespace, merge-marker, or malformed-patch errors.

- [ ] **Step 3: Build the frontend docs site to catch MDX/Nextra syntax regressions**

Run:

```bash
cd frontend && pnpm build
```

Expected: successful Next.js build with the updated MDX pages compiling cleanly.

- [ ] **Step 4: If the build forces final MDX/Markdown fixes, commit them**

Run:

```bash
git add frontend/README.md frontend/src/content/en/index.mdx frontend/src/content/en/application/index.mdx frontend/src/content/en/reference/source-map.mdx README.md README_zh.md README_ja.md README_fr.md README_ru.md backend/README.md backend/docs/README.md backend/docs/ARCHITECTURE.md backend/docs/API.md bff/README.md bff/docs/README.md bff/docs/ARCHITECTURE.md bff/docs/API.md
git commit -m "docs: finalize documentation alignment verification"
```

Expected: either no-op because the workspace is already clean after the build, or one final commit containing only the syntax/build-fix adjustments uncovered by the verification sweep.
