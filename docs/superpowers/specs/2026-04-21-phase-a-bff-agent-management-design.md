# Phase A BFF Agent Management Design

## Goal

先完成 `Agents` 的第一阶段改造：

- 浏览器侧 Agent 管理能力全部经过 BFF
- 前端统一改用 `/api/bff/agents*`
- BFF 提供稳定的 Agent CRUD contract
- BFF 负责鉴权、错误归一化、浏览器入口收口

同时明确：

- **Phase A 暂时不解决 agent 数据的用户隔离**
- **Phase B 必须补上用户隔离与 Agent Chat conversation 化**

## Explicit Scope Decision

这是本次最关键的边界确认。

用户已经接受：

> Phase A 先做到“BFF 鉴权 + BFF contract + 统一前端入口”，但 agent 数据语义暂时仍是全局的。

同时也明确要求：

> 后面必须做用户隔离。

因此本次设计要满足两个目标：

1. 短期：先把浏览器入口彻底收口到 BFF
2. 中期：不给未来的用户隔离方案埋雷

## What “Global Agent Data Semantics” Means Here

Phase A 完成后，系统行为是：

- 浏览器不能再直接打 Gateway `/api/agents`
- 浏览器只能打 BFF `/api/bff/agents*`
- BFF 会校验登录态
- 但 BFF 暂时不会把 agent 绑定到某个具体用户
- 因此底层 agent 列表和详情仍然是全局共享视图

也就是说：

- **访问入口是 BFF-owned**
- **数据 ownership 还不是 user-owned**

这不是最终形态，只是分阶段实施时的可接受中间态。

## Why This Phase Still Matters

即便 Phase A 暂时不做 ownership，它仍然有明确价值：

1. 把 Agents 从 Gateway-facing browser contract 收口到 BFF
2. 避免浏览器继续直接依赖 Gateway agent schema
3. 让鉴权、错误格式、前端入口统一
4. 为 Phase B 的 ownership 和 Agent Chat conversation 化提供稳定外层 contract

如果不先做这一步，Phase B 会变成“前端入口改造 + BFF contract 设计 + ownership + agent chat 迁移”一次性全做，风险过大。

## Current State

### Browser today

当前 frontend `core/agents` 仍然调用：

- `/api/agents`
- `/api/agents/check`
- `/api/agents/{name}`

这些 same-origin routes 本质上仍然是 Gateway-facing browser bridge。

### Backend today

实际 agent 管理由 Gateway `/api/agents` 提供。

其特点：

- 不是 BFF contract
- 受 `agents_api.enabled` 控制
- 不带用户 ownership 模型

## Approaches

### Option A — BFF-owned CRUD contract, downstream still Gateway-backed (recommended)

做法：

- BFF 新增 `/agents*` CRUD routes
- BFF 调 Gateway `/api/agents*`
- frontend 改成 `/api/bff/agents*`
- 不在 Phase A 引入新的 agent ownership persistence

优点：

- 最符合本阶段边界
- 浏览器入口和鉴权立刻统一到 BFF
- 改动范围可控
- 为 Phase B 铺路

缺点：

- 数据仍然是全局语义，不是最终形态

### Option B — Phase A 一次性引入 user-owned agents

做法：

- BFF 建立 user-owned agent metadata / ownership model
- Gateway downstream 只作为原始内容存储或执行层

优点：

- 长期更干净

缺点：

- 超出本阶段边界
- 会显著扩大设计和迁移成本

### Option C — 保留 current `/api/agents`，只在 frontend 命名上包装成 BFF

优点：

- 改动最小

缺点：

- 实质上没有完成“经过 BFF”
- 不符合本阶段目标

## Chosen Direction

采用 **Option A**。

## Phase A Architecture

### 1. BFF public API

新增 BFF routes：

- `GET /agents`
- `GET /agents/check?name=...`
- `GET /agents/{agent_name}`
- `POST /agents`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`

这些 routes 的职责：

- 需要认证
- 返回稳定 JSON contract
- 统一下游错误结构
- 隐藏 Gateway 细节

### 2. Frontend same-origin bridge

frontend 新增：

- `GET /api/bff/agents`
- `GET /api/bff/agents/check`
- `GET /api/bff/agents/{agent_name}`
- `POST /api/bff/agents`
- `PUT /api/bff/agents/{agent_name}`
- `DELETE /api/bff/agents/{agent_name}`

这些 route handlers 的职责：

- 通过 `requireBffAuth()` 获取当前已登录用户身份
- 把 bearer token 转发到 internal BFF
- 不再自己处理 Gateway agents contract

### 3. Frontend browser API layer

`frontend/src/core/agents/api.ts` 改成全部调用：

- `/api/bff/agents`
- `/api/bff/agents/check`
- `/api/bff/agents/{name}`

这样 Phase A 完成后：

- browser → Next.js `/api/bff/agents*` → BFF `/agents*` → Gateway `/api/agents*`

## BFF Implementation Shape

### Route layer

建议新增：

- `bff/app/api/routes/agents.py`

要求：

- route handlers 保持薄
- 调用 DeerFlow client methods
- 做 BFF 风格错误归一化

### Client layer

建议扩展：

- `bff/app/clients/deerflow.py`

新增 methods：

- `list_agents()`
- `check_agent_name(name)`
- `get_agent(name)`
- `create_agent(payload)`
- `update_agent(name, payload)`
- `delete_agent(name)`

### Service layer

本阶段可选。

如果 route 只是单次 client 调用 + 错误归一化，可以先不加复杂 service。
但如果实现中开始出现：

- payload translation
- shared validation
- future phase hooks

则可以加入轻量 service 统一逻辑。

## Contract Design

### Request / response strategy

本阶段优先复用当前 frontend 已经在用的 agent shape：

- `name`
- `description`
- `model`
- `tool_groups`
- `soul`

这样可以让 frontend `AgentGallery`、`agent-card`、`new agent` 页在未来重新启用时尽量少改 view 层。

### Error normalization

BFF 不应把 Gateway 错误原样透给浏览器。

要求：

- 404 -> stable not-found error
- 409 -> stable already-exists error
- 422 -> stable invalid-name / invalid-input error
- 502/503/504 -> stable backend unreachable error

frontend `core/agents/api.ts` 继续保留现有 `AgentNameCheckError` 这样的产品层错误语义，但数据源改为 BFF。

## Future Development Roadmap

为了避免“Phase A 做完后又回到边做边想”的状态，这里把后续开发计划提前写清楚。

### Overview

建议把后续 `Agents` 演进拆成 3 个阶段：

1. **Phase A — BFF Agent Management**
   - 先把 Agent 管理入口、鉴权、浏览器 contract 收口到 BFF
2. **Phase B — BFF Agent Conversations**
   - 把 Agent Chat 从 legacy `thread_id` 迁移到 BFF `conversation_id`
3. **Phase C — Ownership And Product Completion**
   - 把 agent ownership、recent list 最终语义和产品闭环收口到用户隔离模型

这样拆分的原则是：

- 先统一入口和鉴权
- 再统一会话模型
- 最后统一 ownership 和产品体验

### Phase A Deliverables

Phase A 的最终交付物是：

- BFF `/agents*` CRUD routes
- frontend `/api/bff/agents*` same-origin bridge
- frontend `core/agents/api.ts` 切到 BFF
- 统一鉴权与错误归一化
- `Agents` 前端 UI 仍可继续隐藏，直到 Phase B 准备好重新开放

Phase A 完成后，意味着：

- **浏览器入口经过 BFF** 已经解决
- **数据 ownership** 还没有解决
- **Agent Chat** 还没有迁移

### Phase B Deliverables

Phase B 的目标是：让 `Agent Chat` 真正进入 BFF conversation 体系。

建议交付内容：

- `conversations` persistence model 增加 `agent_name: nullable string`
- BFF `ConversationListItem` / `ConversationDetailResponse` 增加 `agent_name` 字段
- 新增 `POST /agents/{agent_name}/conversations`
  - 为某个 agent 创建新的 BFF conversation
- 更新 `POST /conversations/{conversation_id}/messages/stream`
  - BFF 从 conversation 元数据读取 `agent_name`
  - 自动把 `agent_name` 注入 runtime context
- Agent Chat browser route 改为：
  - `/workspace/agents/{agent_name}/chats/new`
  - `/workspace/agents/{agent_name}/chats/{conversation_id}`
- frontend Agent Chat 状态层改用 BFF conversation hooks，而不是 legacy thread hooks
- `new agent` bootstrap 流程的 BFF 化
  - 创建 agent 后直接创建 bootstrap conversation
  - 用 BFF stream route 完成 `setup_agent` 保存流程
  - bootstrap 保存完成后再进入常规 Agent Chat 流程

Phase B 完成后，意味着：

- 浏览器不再暴露 legacy `thread_id`
- Agent Chat 和主聊天共用 BFF conversation ownership 模型
- recent list 可以开始统一建模

### Phase C Deliverables

Phase C 是最终产品收口阶段，重点解决“用户隔离”和“体验完整性”。

建议交付内容：

- 定义 Agent ownership 模型
  - 某个 agent 是否属于某个 user
  - BFF 是否需要自己的 agent ownership persistence
- recent list 的最终语义
  - 普通 conversation 与 agent conversation 是否合并展示
  - 是否按 `agent_name` 做分组或标签
- Agent Gallery 的产品闭环
  - create / update / delete / open chat / bootstrap progress 展示细节
- 文档与运营文案收口
  - 明确 agents 是用户隔离能力，不再是全局共享能力

Phase C 完成后，`Agents` 才能算真正产品完成。

## Milestones And Readiness Gates

### Ready to start Phase A when

- 你确认接受“Phase A 只解决 BFF 入口，不解决 ownership”
- frontend 继续隐藏 `Agents`，避免半成品重新暴露

### Ready to start Phase B when

- Phase A 已落地并稳定
- frontend `/api/bff/agents*` 已成为唯一浏览器管理入口
- 你确认 `conversation_id` 会成为 Agent Chat 的新外部语义

### Ready to start Phase C when

- Phase B 已完成 conversation migration
- 需要把 `Agents` 正式重新开放给用户
- ownership、recent list、bootstrap 流程都准备一起收口

## Future Testing Plan

### Phase A tests

- BFF `/agents*` auth tests
- BFF deerflow client contract tests
- frontend `/api/bff/agents*` route boundary tests
- frontend `core/agents/api.ts` boundary tests

### Phase B tests

- BFF conversation schema migration tests
- stream route injects `agent_name` tests
- bootstrap conversation flow tests
- recent list path generation tests
- Agent Chat page route / state migration tests

### Phase C tests

- ownership enforcement tests
- bootstrap conversation flow tests
- end-to-end create-agent → setup → chat journey tests

## Product Re-Enable Criteria

前端 `Agents` 重新开放的最低门槛建议是：

1. Phase A 已完成，浏览器不再调用 Gateway agents contract
2. Phase B 已完成，浏览器不再暴露 `thread_id`
3. 至少有一版明确的 ownership 方案已确定（即便 Phase C 还在收尾）

如果这三个条件没有满足，建议继续保持前端隐藏。

## What Phase A Deliberately Does Not Solve

这一点必须写清楚，避免误以为 Phase A 做完就已经完成 Agents。

Phase A **不解决**：

- Agent ownership（谁拥有哪个 agent）
- Agent recent conversations 语义
- Agent Chat route 从 `thread_id` 切换到 `conversation_id`
- `new agent` bootstrap chat 迁移到 BFF conversation
- Agent-specific recent list / pin / rename / delete behavior

这些都属于 **Phase B**。

## Phase B Obligation

Phase B 必须继续完成：

1. `agent_name` 进入 BFF conversation 模型
2. Agent Chat 外部路由使用 `conversation_id`
3. Agent conversations recent list 统一到 BFF conversations
4. 明确用户隔离语义
5. 真正解决“agent 是否属于某个用户”的 ownership 问题

换句话说：

- Phase A 让入口和鉴权先对齐 BFF
- Phase B 才让数据 ownership 与会话模型彻底对齐 BFF

## Testing Requirements

### BFF

新增 / 更新测试：

- routes require auth
- each route calls the expected DeerFlow client method
- downstream errors normalize to stable BFF errors

### Frontend bridges

新增 / 更新测试：

- `/api/bff/agents*` route handlers use `requireBffAuth`
- route handlers call internal BFF instead of Gateway
- old `/api/agents*` usage disappears from browser-facing `core/agents/api.ts`

### Frontend browser API

新增 / 更新测试：

- `core/agents/api.ts` targets `/api/bff/agents*`
- existing frontend error semantics remain stable

## Success Criteria

Phase A 完成后应满足：

1. 浏览器不再调用 `/api/agents*`
2. 浏览器只调用 `/api/bff/agents*`
3. BFF 成为唯一对外的 Agent CRUD contract
4. 所有 Agent CRUD 请求必须先经过 BFF 鉴权
5. frontend 不再直接依赖 Gateway agents schema 细节
6. Phase B 的用户隔离和 Agent Chat BFF 化没有被本阶段设计阻断

## Self Review

已检查：

- 范围严格限定在 Agent 管理 CRUD
- 明确接受了 Phase A 的“BFF 入口已统一，但数据仍全局”的中间态
- 同时明确 Phase B 必须做用户隔离，避免这个中间态被误当成终态
- 合同边界、复用范围、以及不做事项都已写清楚
