# Phase B BFF Agent Conversations And Bootstrap Design

## Goal

完成 `Agents` 的第二阶段改造：

- 把 Agent Chat 从 legacy `thread_id` 模型迁移到 BFF `conversation_id` 模型
- 让 `agent_name` 进入 BFF conversation 数据模型与 API contract
- 让 `new agent` 的 `setup_agent` bootstrap 保存流程通过 BFF conversation 完成
- 浏览器不再直接感知 Agent Chat 的 runtime thread internals
- 为后续用户隔离与 recent list 统一建模打下基础

## Why Phase B Exists

Phase A 只能解决一个问题：

- browser Agent 管理入口必须经过 BFF

但它解决不了另一个更核心的问题：

- Agent Chat 仍然是 legacy thread 语义
- bootstrap 保存流程仍然依赖旧 thread 页面
- recent list 还无法和主聊天 conversation 体系真正统一
- 浏览器仍然暴露 `thread_id`

因此，Phase B 的职责是：

> 把 `Agents` 的“会话层”彻底迁移到 BFF conversation 模型。

只有这一步完成后，`Agents` 才真正开始摆脱 legacy thread 路径。

## Current State

### Agent Chat today

当前 Agent Chat：

- 路由：`/workspace/agents/{agent_name}/chats/{thread_id}`
- 页面：legacy `useThreadChat()` + `useThreadStream()`
- 首条消息发送后，浏览器 URL 改写为 runtime `thread_id`
- stream 请求通过 runtime context 手动附加 `agent_name`

这意味着：

- 浏览器仍然感知 runtime thread
- Agent Chat 与主聊天不是同一会话模型
- BFF recent conversations 无法天然承载 agent chat

### New agent bootstrap today

当前 `new agent` 页的保存体验本质上也是 legacy thread：

- 创建空 agent
- 进入 bootstrap chat
- 通过 `setup_agent` tool 保存 agent 配置

问题在于：

- 这个 bootstrap chat 不属于 BFF conversation
- 浏览器仍然直接依赖 runtime thread 语义
- 未来 recent list / ownership 都无法统一建模

### Main BFF chat today

主聊天已经提供完整基础设施：

- browser route: `/workspace/chats/{conversation_id}`
- BFF `conversations` persistence
- BFF `/conversations/{conversation_id}/messages/stream`
- recent list、rename/pin/delete、artifact/upload/suggestions

Phase B 的核心思想是：

- **Agent Chat 不再另起一套会话模型**
- 而是成为“带 `agent_name` 元数据的 BFF conversation”

## Core Decision

### Agent Chat must become a specialized BFF conversation

这是本阶段的决定性设计：

- Agent Chat 的外部 ID 改成 `conversation_id`
- BFF 内部继续映射到 `deerflow_thread_id`
- `agent_name` 成为 conversation 的显式属性
- BFF stream route 在发送消息时自动注入该 `agent_name`

这样做的结果是：

- 浏览器不再暴露 `thread_id`
- Agent Chat 和主聊天进入同一 ownership 模型
- recent list 最终可以统一
- bootstrap conversation 也能落在同一会话模型里

## Approaches

### Option A — Store `agent_name` on conversations and let one stream route handle both chats (recommended)

做法：

- `conversations` 表增加 `agent_name: nullable string`
- `NULL` 表示普通 conversation
- 非空表示 agent conversation
- 继续复用现有 `/conversations/{conversation_id}/messages/stream`
- BFF route 根据 conversation 的 `agent_name` 自动注入 context

优点：

- conversation 模型统一最彻底
- recent list 和 ownership 最终容易统一
- bootstrap 和常规 agent chat 也可以统一建模
- 不需要为 agent chat 再造一套 stream contract

缺点：

- 需要 schema migration 和 type 扩展
- 需要前端 Agent Chat 页面改用 BFF chat 状态层

### Option B — Separate `/agent-conversations/*` model

做法：

- 为 agent chat 引入与普通 conversation 并行的新 persistence / API surface

优点：

- 与当前 agent 页面结构更贴近

缺点：

- 再次制造双轨模型
- 和总纲方向冲突
- recent list 最终还是会分裂
- 不推荐

### Option C — Keep legacy thread for bootstrap, only migrate regular agent chat

优点：

- 迁移量似乎更小

缺点：

- `setup_agent` conversation 与常规 agent chat 分裂成两套体系
- 后面 recent list 和 ownership 会更难统一
- 会把 bootstrap 流程变成永久例外
- 不推荐

## Chosen Direction

采用 **Option A**。

## Proposed Architecture

### 1. Persistence model

当前 BFF `conversations` 表增加：

- `agent_name: nullable string`

语义：

- `NULL` → 普通主聊天 conversation
- 非空 → agent conversation

设计约束：

- `agent_name` 只表示这条 conversation 在 runtime 中绑定到哪个 agent
- 它不是 ownership 字段
- ownership 仍然由 `conversation.user_id` 决定
- 更深层的 `agent` 本体是否属于某个用户，留给 Phase C 解决

### 2. BFF routes

#### New conversation creation

新增：

- `POST /agents/{agent_name}/conversations`

职责：

- 鉴权
- 创建 runtime thread
- 创建带 `agent_name` 的 BFF conversation 记录
- 返回新的 `conversation_id`

#### Conversation list/detail

扩展：

- `GET /conversations`
- `GET /conversations/{conversation_id}`

返回结构中新增：

- `agent_name?: string | null`

这样 recent list 和 detail 页面就能知道某条 conversation 是否属于某个 agent。

#### Stream route

继续使用：

- `POST /conversations/{conversation_id}/messages/stream`

但行为改为：

1. 按 `conversation_id` 找到 conversation
2. 验证 ownership
3. 读取 `conversation.agent_name`
4. 若存在 `agent_name`，把它自动合并进 DeerFlow runtime context
5. 发起下游 stream

这样浏览器不需要再每次手动传 `agent_name`。

### 3. Frontend browser routes

Agent Chat 浏览器路由改为：

- `/workspace/agents/{agent_name}/chats/new`
- `/workspace/agents/{agent_name}/chats/{conversation_id}`

注意：

- `new` 是一个产品路由
- 真正开始会话后，地址切换到 `conversation_id`
- 再也不暴露 `thread_id`

### 4. Frontend state model

可复用的基础设施：

- `frontend/src/core/bff-chat/*`
- existing BFF recent conversation list
- conversation resource routes for artifacts/uploads/suggestions

需要改造的部分：

- `BffConversation` / `BffConversationDetail` 类型增加 `agent_name`
- recent list 的 path builder 要能根据 `agent_name` 跳到：
  - 普通 chat → `/workspace/chats/{conversation_id}`
  - agent chat → `/workspace/agents/{agent_name}/chats/{conversation_id}`
- Agent Chat page 要从 legacy `useThreadStream()` 切换到 BFF chat state

## Bootstrap Save Flow Design

### Desired flow

未来 `new agent` 的保存流程改成：

1. 用户进入 `/workspace/agents/new`
2. 输入 agent name
3. frontend 调 BFF `/agents/check`
4. frontend 调 BFF `POST /agents` 创建 agent
5. frontend 调 BFF `POST /agents/{agent_name}/conversations` 创建 bootstrap conversation
6. 页面跳到 `/workspace/agents/{agent_name}/chats/{conversation_id}`
7. 通过 BFF `/conversations/{conversation_id}/messages/stream` 发送 bootstrap message
8. BFF 根据该 conversation 的 `agent_name` 自动注入 runtime context
9. runtime 执行 `setup_agent`
10. conversation 保留下来，用户继续在同一条 BFF conversation 里聊天

### Why bootstrap belongs in Phase B

因为它依赖：

- `conversation_id` 替代 `thread_id`
- `agent_name` 进入 conversation 元数据
- BFF stream route 自动注入 `agent_name`

所以它天然属于会话层迁移，而不是 Phase A 的纯 CRUD 范畴。

## Recent List Design

### Immediate Phase B effect

Phase B 完成后，recent list 至少需要支持：

- conversation list items 带 `agent_name`
- 根据是否存在 `agent_name` 生成不同跳转路径

但 Phase B 暂时不要求把所有视觉语义完全定稿。

### Deferred to Phase C

这些问题留到 Phase C：

- agent conversations 和普通 conversations 是混排还是分组
- 是否加 agent badge
- 是否按 agent 过滤
- sidebar 信息架构最终长什么样

## What Phase B Deliberately Does Not Solve

Phase B **不解决**：

- agent ownership（哪个 agent 属于哪个用户）
- Agent Gallery 最终产品闭环
- recent list 的最终视觉/产品语义
- “共享 agent” 还是 “私有 agent” 这种产品策略

它的职责只是：

- 统一会话模型
- 统一 bootstrap 流程
- 消灭浏览器可见的 `thread_id`

## Risks And Mitigations

### Risk 1 — `agent_name` 只挂在路由上，不挂在 conversation 上

**风险**：路由和真实 conversation 绑定关系可能漂移。\
**缓解**：把 `agent_name` 存进 conversation persistence，route 只是 view URL，不是唯一真实来源。

### Risk 2 — bootstrap conversation 和 regular conversation 分裂

**风险**：`setup_agent` 走一套，正常聊天走另一套。\
**缓解**：从一开始就把 bootstrap 视为 “Agent Conversation 的第一条会话消息”。

### Risk 3 — recent list 被迫继续同时理解 legacy thread 与 BFF conversation

**风险**：Phase B 实现不彻底，UI 继续双轨。\
**缓解**：把 browser route 完全切到 `conversation_id`，不保留新的 agent thread URL 入口。

## Testing Requirements

### BFF

新增 / 更新测试：

- `conversations` schema / model migration tests for `agent_name`
- `POST /agents/{agent_name}/conversations` auth and create tests
- `GET /conversations` includes `agent_name`
- `GET /conversations/{conversation_id}` includes `agent_name`
- stream route injects stored `agent_name` into runtime context

### Frontend route / state

新增 / 更新测试：

- agent chat routes use `conversation_id` not `thread_id`
- recent list path generation switches on `agent_name`
- new agent flow creates bootstrap conversation before entering chat
- Agent Chat page uses BFF chat API/hook layer rather than legacy thread hooks

### End-to-end scope

后续环境允许时，应至少有：

- create agent → bootstrap save → continue chatting 的完整流测试
- recent list 能正确跳回 agent conversation 的导航测试

## Exit Criteria

Phase B 完成后，应满足：

1. 浏览器上的 Agent Chat 不再出现 `thread_id`
2. `new agent` 的保存体验通过 BFF conversation 完成
3. BFF conversation model 能表达 `agent_name`
4. Agent Chat 与主聊天共享 BFF conversation stream contract
5. recent list 至少可以基于 `agent_name` 正确路由

## Self Review

已检查：

- 这份 spec 聚焦会话层，不和 Phase A 的 CRUD 设计混淆
- `setup_agent` bootstrap 保存流程被明确纳入本阶段
- 没有越界去定义最终 ownership 模型
- 也没有继续给 legacy `thread_id` 留浏览器公开语义
