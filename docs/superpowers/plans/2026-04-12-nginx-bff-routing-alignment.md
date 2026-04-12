# Nginx BFF Routing Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align both nginx configs so browser-facing bridge-owned API routes fall through to `frontend` instead of being explicitly proxied to `Gateway`.

**Architecture:** Keep the existing runtime boundary intact: LangGraph, Gateway compat, docs, health, and SSE-sensitive chat streaming stay explicitly routed. Remove only the legacy direct-to-Gateway browser API blocks that Next.js already owns through same-origin bridge routes, letting those requests resolve through the frontend catch-all.

**Tech Stack:** nginx, Next.js route handlers, BFF bridge architecture, git worktrees

---

### Task 1: Remove legacy direct-Gateway browser API ownership from local nginx

**Files:**
- Modify: `docker/nginx/nginx.local.conf:107-179`
- Test: `docker/nginx/nginx.local.conf`

- [ ] **Step 1: Write the failing boundary check as a shell assertion**

Create a temporary assertion command that fails while the legacy route blocks still exist:

```bash
rg -n "location /api/models|location /api/memory|location /api/mcp|location /api/skills|location /api/agents|location ~ \\^/api/threads" docker/nginx/nginx.local.conf
```

Expected: matches six legacy route blocks.

- [ ] **Step 2: Remove only the browser-visible direct-Gateway blocks**

Edit `docker/nginx/nginx.local.conf` so this legacy section:

```nginx
        # Custom API: Models endpoint
        location /api/models {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Custom API: Memory endpoint
        location /api/memory {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Custom API: MCP configuration endpoint
        location /api/mcp {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Custom API: Skills configuration endpoint
        location /api/skills {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Custom API: Agents endpoint
        location /api/agents {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Custom API: Uploads endpoint
        location ~ ^/api/threads/[^/]+/uploads {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Large file upload support
            client_max_body_size 100M;
            proxy_request_buffering off;
        }

        # Custom API: Other endpoints under /api/threads
        location ~ ^/api/threads {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
```

with a single ownership note:

```nginx
        # Browser-facing bridge-owned APIs now fall through to frontend so
        # Next.js same-origin route handlers own /api/models, /api/memory,
        # /api/mcp, /api/skills, /api/agents, and /api/threads/*.
```

- [ ] **Step 3: Run the boundary check to verify the legacy blocks are gone**

Run:

```bash
rg -n "location /api/models|location /api/memory|location /api/mcp|location /api/skills|location /api/agents|location ~ \\^/api/threads" docker/nginx/nginx.local.conf
```

Expected: no output.

- [ ] **Step 4: Verify the local config still parses**

Run:

```bash
nginx -t -p "$PWD" -c docker/nginx/nginx.local.conf
```

Expected: `syntax is ok` and `test is successful`.

- [ ] **Step 5: Commit**

```bash
git add docker/nginx/nginx.local.conf
git commit -m "Align local nginx browser API routing"
```

### Task 2: Remove the same legacy ownership from container nginx

**Files:**
- Modify: `docker/nginx/nginx.conf:89-161`
- Test: `docker/nginx/nginx.conf`

- [ ] **Step 1: Write the failing boundary check for the container config**

Run:

```bash
rg -n "location /api/models|location /api/memory|location /api/mcp|location /api/skills|location /api/agents|location ~ \\^/api/threads" docker/nginx/nginx.conf
```

Expected: matches the same legacy route set as the local config.

- [ ] **Step 2: Mirror the local ownership cleanup**

Edit `docker/nginx/nginx.conf` so the direct-Gateway blocks for:

```text
/api/models
/api/memory
/api/mcp
/api/skills
/api/agents
/api/threads/*
```

are removed and replaced with the same explanatory comment used in `docker/nginx/nginx.local.conf`:

```nginx
        # Browser-facing bridge-owned APIs now fall through to frontend so
        # Next.js same-origin route handlers own /api/models, /api/memory,
        # /api/mcp, /api/skills, /api/agents, and /api/threads/*.
```

- [ ] **Step 3: Run the boundary check to verify the legacy blocks are gone**

Run:

```bash
rg -n "location /api/models|location /api/memory|location /api/mcp|location /api/skills|location /api/agents|location ~ \\^/api/threads" docker/nginx/nginx.conf
```

Expected: no output.

- [ ] **Step 4: Verify the container config still parses**

Run:

```bash
nginx -t -p "$PWD" -c docker/nginx/nginx.conf
```

Expected: `syntax is ok` and `test is successful`.

- [ ] **Step 5: Commit**

```bash
git add docker/nginx/nginx.conf
git commit -m "Align container nginx browser API routing"
```

### Task 3: Verify ownership parity and preserve SSE handling

**Files:**
- Modify: `docker/nginx/nginx.local.conf`
- Modify: `docker/nginx/nginx.conf`
- Test: `docker/nginx/nginx.local.conf`
- Test: `docker/nginx/nginx.conf`

- [ ] **Step 1: Assert the SSE bridge route still exists in both configs**

Run:

```bash
rg -n "^\\s*location ~ \\^/api/bff/conversations/\\[\\^/\\]\\+/messages/stream\\$" docker/nginx/nginx.local.conf docker/nginx/nginx.conf
```

Expected: one match in each file.

- [ ] **Step 2: Assert the browser-facing APIs now fall through to frontend**

Run:

```bash
rg -n "location /api/models|location /api/memory|location /api/mcp|location /api/skills|location /api/agents|location ~ \\^/api/threads" docker/nginx/nginx.local.conf docker/nginx/nginx.conf
```

Expected: no output from either file.

- [ ] **Step 3: Confirm the frontend catch-all remains the terminal ownership rule**

Run:

```bash
tail -n 20 docker/nginx/nginx.local.conf
tail -n 20 docker/nginx/nginx.conf
```

Expected: both files still end with the frontend catch-all:

```nginx
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
```

- [ ] **Step 4: Review the diff for scope control**

Run:

```bash
git diff -- docker/nginx/nginx.local.conf docker/nginx/nginx.conf
```

Expected: only the legacy direct-to-Gateway browser API blocks are removed or replaced with a short ownership comment; LangGraph, Gateway compat, docs, health, and SSE route blocks remain intact.

- [ ] **Step 5: Commit**

```bash
git add docker/nginx/nginx.local.conf docker/nginx/nginx.conf
git commit -m "Verify nginx BFF routing ownership parity"
```
