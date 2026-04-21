# BFF-Owned Agents Architecture Design

## Goal

把当前 `Agents` 从“前端页面 + Gateway agents API + legacy runtime thread chat”的混合实现，演进为真正 **BFF-owned** 的功能体系：

- Agent 管理经过 BFF
- Agent Chat 经过 BFF
- 浏览器不再直接依赖 Gateway agents / legacy thread 语义
- 对外统一使用 BFF 的鉴权、ownership 和 contract
- 不再让 `thread_id` 成为浏览器公开语义

## High-Level Assessment

**结论：可行。**

但这不是一个“小修补”任务，而是一个 **中等偏大** 的架构演进任务。

当前仓库已经具备相当多可复用的 BFF 基础设施：

- authenticated browser → same-origin `/api/bff/*` bridge
- BFF `conversation` ownership model
- BFF streaming contract
- recent conversations list / rename / pin / delete
- artifacts / suggestions / uploads 这些围绕 conversation 的资源边界

因此，“Agents 完全经过 BFF”不是从零开始。

真正困难的点不在底层基础设施，而在：

1. 现有 Agents 仍然基于 legacy `thread_id`
2. BFF conversation 模型还没有 `agent_name`
3. `new agent` bootstrap 流程依赖 runtime thread 上下文
4. 最近对话和 Agent Chat 的信息架构还没有统一

## Current State

### 1. Agent management today

当前 frontend `Agents` 管理能力仍走 Gateway-facing 路径：

- `frontend/src/core/agents/api.ts`
- same-origin `/api/agents`
- backend Gateway `/api/agents`

这意味着：

- 它不经过 BFF contract
- 它不受 BFF ownership / schema normalization 保护
- 它的可用性直接受 Gateway `agents_api.enabled` 开关影响

### 2. Agent chat today

当前 `Agent Chat` 页面虽然 UI 已恢复，但仍然是 legacy thread 语义：

- 路由：`/workspace/agents/:agent_name/chats/:thread_id`
- 页面使用 `useThreadChat()` / `useThreadStream()`
- 首条消息后把 URL 替换成 runtime `thread_id`
- 发送消息时把 `agent_name` 放进 context

这意味着：

- 浏览器仍然感知 `thread_id`
- 它不是 BFF conversation ownership 模型
- 它和主聊天是两套会话体系

### 3. Main BFF chat today

主聊天路径已经是 BFF-owned：

- browser path: `/workspace/chats/:conversation_id`
- browser API: `/api/bff/conversations/*`
- BFF persistence: `conversations` table
- BFF stream route: `/conversations/{conversation_id}/messages/stream`

它已经解决了：

- auth
- ownership
- recent list
- rename/pin/delete
- artifacts / uploads / suggestions

因此，未来 `Agent Chat` 最合理的方向不是继续强化 legacy thread，而是 **落到 conversation model 上**。

## Non-Negotiable Requirements

基于你的要求，后续设计必须满足：

1. **Agent 管理必须经过 BFF**
2. **Agent Chat 也必须经过 BFF**
3. **浏览器不能再以 `thread_id` 为主语义**
4. **如果某项 Agents 能力需要绕过 BFF，则宁愿暂时不做**
5. **尽量复用现有主路径 BFF chat 基础设施**

## Approaches

### Option A — Full BFF-Owned Agents (recommended)

做法：

- BFF 增加 `/agents` 管理 contract
- BFF conversation 模型增加 `agent_name` 元数据
- Agent Chat 路由改用 `conversation_id`
- browser 通过 BFF conversations 访问 agent 聊天
- recent conversations 统一由 BFF conversations 提供

优点：

- 完全符合“必须经过 BFF”的要求
- 和现有主聊天基础设施高度一致
- recent list / ownership / auth 可以统一
- 为后续更多 agent-specific product 能力打下干净基础

缺点：

- 改动比“修几个页面”大得多
- 需要数据库 schema 与 BFF stream contract 扩展
- 最好拆阶段实施

### Option B — Agent management through BFF, Agent Chat remains legacy thread

优点：

- 改动较小

缺点：

- 与你的硬要求冲突
- 仍然留下双轨会话模型
- 不推荐

### Option C — Keep current Agents and keep patching UX issues

优点：

- 短期最省事

缺点：

- 不符合“绕过 BFF 就宁愿不做”的要求
- 长期维护成本高
- 不推荐

## Chosen Direction

采用 **Option A：Full BFF-Owned Agents**。

## Key Architecture Decision

### Make Agent Chat a specialized BFF conversation, not a legacy thread page

这是整套设计的核心。

具体来说：

- `conversation_id` 成为 Agent Chat 的外部 ID
- `deerflow_thread_id` 继续只存在于 BFF / Gateway 内部映射层
- `agent_name` 成为 conversation 的一个显式属性
- BFF 在 stream / detail / recent list 等操作中，根据 conversation 的 `agent_name` 自动附加 agent context

这样做的好处是：

- frontend 不再看到 thread internals
- Agent Chat 和主聊天共享同一套 ownership 模型
- recent list 不再需要在 BFF chat / legacy thread 之间切换
- artifacts / uploads / suggestions 可以复用 BFF conversation resource routes

## Proposed Architecture

### 1. BFF public API surface

#### Agent management

新增 BFF-owned routes：

- `GET /agents`
- `GET /agents/check?name=...`
- `GET /agents/{agent_name}`
- `POST /agents`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`

这些 routes 的职责：

- 认证
- 稳定化错误结构
- 从 BFF 层统一向下游 Gateway `/api/agents` 调用
- 避免浏览器继续感知 Gateway agents schema 细节

#### Agent conversations

新增或扩展 BFF routes：

- `POST /agents/{agent_name}/conversations`
  - 创建一个与该 agent 绑定的新 conversation
- `GET /conversations`
  - 返回 conversation 列表时带上 `agent_name`
- `GET /conversations/{conversation_id}`
  - detail response 带上 `agent_name`
- `POST /conversations/{conversation_id}/messages/stream`
  - BFF 根据该 conversation 的 `agent_name` 自动注入 agent context

这里的关键点是：

- **stream route 不需要把 `agent_name` 暴露给浏览器作为每次请求字段**
- 它应该从 BFF 持久化的 conversation 元数据中读取

### 2. BFF persistence model

当前 `conversations` 表至少需要增加：

- `agent_name: nullable string`

语义：

- `NULL` → 普通主聊天 conversation
- 非空 → agent conversation

这样，BFF recent list / detail / delete / stream 都可以统一处理。

### 3. BFF stream behavior

当前 `StreamMessageRequest` 是围绕主聊天的共享上下文字段：

- model_name
- thinking_enabled
- is_plan_mode
- subagent_enabled
- reasoning_effort

为了支持 agent conversation，BFF stream route 应该：

1. 先按 `conversation_id` 找到 conversation
2. 验证 ownership
3. 读取 `conversation.agent_name`
4. 在发往 DeerFlow runtime 时，把 `agent_name` 合并进 context

这样 Agent Chat 页面就不需要继续依赖 legacy `useThreadStream()`。

### 4. Frontend routing

浏览器路径建议保留产品语义：

- `/workspace/agents`
- `/workspace/agents/new`
- `/workspace/agents/:agent_name/chats/new`
- `/workspace/agents/:agent_name/chats/:conversation_id`

注意最后一个参数应改为：

- `conversation_id`
- **不再是 `thread_id`**

这能保留原有产品 URL 结构，同时完成到底层语义切换。

### 5. Frontend state / hooks reuse

可复用部分：

- `frontend/src/core/bff-chat/*`
- `RecentChatList`
- BFF conversation recent list mutations
- BFF artifacts / suggestions / uploads

需要改造部分：

- route helper（基于 `agent_name` 生成 path）
- `BffConversation` type 需要新增 `agent_name`
- new agent flow 需要在创建 agent 后走 `POST /agents/{agent_name}/conversations`
- agent chat page 需要改为 BFF conversation hooks，而不是 legacy thread hooks

## Product Behavior

### Agent Gallery

保留：

- gallery 入口
- 新建按钮
- 删除按钮
- “进入聊天”按钮

但这些动作都应走 BFF-owned agents contract。

### New Agent flow

未来推荐流程：

1. 用户输入 agent name
2. frontend 调 BFF `/agents/check`
3. frontend 调 BFF `POST /agents` 创建 agent
4. frontend 调 BFF `POST /agents/{agent_name}/conversations` 创建 bootstrap conversation
5. 页面跳到 `/workspace/agents/{agent_name}/chats/{conversation_id}`
6. 通过 BFF stream route 发送 bootstrap messages
7. BFF 为该 conversation 自动注入 `agent_name`

### Recent conversations

未来 recent list 应统一使用 BFF conversations。

语义建议：

- agent conversations 和普通 conversations 共用一个 recent list 数据源
- 但 agent conversation 在路由上跳到 `/workspace/agents/{agent_name}/chats/{conversation_id}`
- 普通 conversation 继续跳到 `/workspace/chats/{conversation_id}`

这意味着 recent list 最终需要具备：

- 识别 `agent_name`
- 根据 `agent_name` 生成不同目标路径

### Agent Chat page

Agent Chat 应成为：

- “带 `agent_name` 元数据的 BFF conversation 页面”
- 而不是 legacy thread chat page

## Why This Is Feasible

这条路可行的原因是：

1. BFF auth / ownership 已成熟
2. BFF conversation persistence 已存在
3. BFF stream path 已存在
4. frontend BFF chat hooks / recent list / conversation UI 已存在
5. Agent Chat 与主聊天 UI 外壳本就高度相似

所以不是从零做 Agents，而是：

- **复用主路径 BFF chat 基础设施**
- **重构现有 Agents 的状态模型与 contract**

## What Is Not Directly Reusable

不能直接照搬的部分：

- 现有 `frontend/src/core/agents/api.ts`
- 现有 legacy `AgentChatPage` 的 `thread_id` 语义
- 现有 `new agent` 页直接基于 legacy thread 的 bootstrap 逻辑
- 当前 `pathOfThread()` / legacy thread route helpers

这些部分如果硬复用，只会把 legacy 语义继续带进 BFF 化方案。

## Recommended Delivery Strategy

这个项目**不建议一次性无阶段地整体实现**。

推荐拆成 3 个阶段：

### Phase 1 — BFF-owned agent management contract

目标：

- 把 `/agents` 管理 API 收进 BFF
- frontend `core/agents` 不再直接依赖 Gateway-facing same-origin `/api/agents`

交付物：

- BFF `/agents*`
- frontend `/api/bff/agents*`
- gallery / create / delete / update 走 BFF

### Phase 2 — Agent conversation data model

目标：

- conversation 表增加 `agent_name`
- BFF conversation schemas / recent list 支持 `agent_name`
- frontend recent list route helper支持按 `agent_name` 跳转

交付物：

- BFF model / schema / service 变更
- recent list route generation 统一

### Phase 3 — Agent Chat migration to BFF conversation

目标：

- Agent Chat 从 `thread_id` 切到 `conversation_id`
- `new agent` bootstrap conversation 走 BFF
- Agent Chat page 改用 BFF conversation detail / stream

交付物：

- `/workspace/agents/:agent_name/chats/:conversation_id`
- Agent bootstrap stream through BFF
- legacy agent thread page 退场

## Testing Implications

需要新增或扩展测试的地方包括：

### BFF

- `/agents*` auth / error normalization / downstream mapping
- agent conversation creation and ownership
- stream route injects stored `agent_name`
- conversation list/detail includes `agent_name`

### Frontend

- `/api/bff/agents*` route ownership tests
- recent list path generation for agent vs non-agent conversations
- Agent gallery create/delete flows through BFF
- Agent Chat page uses `conversation_id`, not `thread_id`

## Success Criteria

这条路线真正完成时，应满足：

1. 浏览器不再依赖 `/api/agents` Gateway-facing contract
2. 浏览器不再以 `thread_id` 作为 Agent Chat 外部语义
3. Agent Chat / main chat 共用 BFF conversation ownership model
4. recent list 能统一展示普通和 agent conversations
5. 所有 Agents 功能都经过 BFF 鉴权边界

## Self Review

已检查：

- 判断明确：这条路线可行
- 也明确指出了哪些部分可复用、哪些必须重构
- 没有把 legacy thread 继续包装成“看起来像 BFF”
- 方案与你“必须经过 BFF，否则宁愿不做”的要求一致
- 范围较大，因此明确建议拆成 3 个阶段推进
