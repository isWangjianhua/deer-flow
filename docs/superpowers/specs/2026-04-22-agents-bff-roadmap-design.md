# Agents BFF Roadmap Design

## Goal

为 `Agents` 功能定义一条清晰、可分阶段落地的 BFF 化路线图，目标是最终达到：

- Agent 管理经过 BFF
- Agent Chat 经过 BFF
- 浏览器不再依赖 legacy `thread_id`
- `Agents` 满足用户隔离要求
- 最近对话、bootstrap 创建体验、主聊天与 Agent Chat 的产品语义最终统一

同时明确在完整方案完成前：

- 前端继续隐藏 `Agents` UI
- 现有代码保留，仅作为后续迁移参考

## Why A Roadmap Is Needed

当前 `Agents` 的问题不是单点问题，而是一串互相耦合的问题：

1. 管理入口仍然是 Gateway-facing
2. Agent Chat 仍然使用 legacy `thread_id`
3. recent list 当前是围绕 BFF conversations 设计的
4. `setup_agent` 的 bootstrap 保存流程仍然依赖 legacy thread 路径
5. 还没有用户隔离和 ownership 模型

这意味着：

- 不能只修某一页 UI 就说 `Agents` 完成了
- 也不适合一次性把所有改造混在一个开发阶段里做

因此需要一份总纲 roadmap，把整个演进过程拆成稳定阶段，并给出每个阶段的完成标准和下一阶段的进入条件。

## Product Principle

这份 roadmap 基于一个明确原则：

> 如果 `Agents` 不能经过 BFF，就宁愿暂时不做。

进一步推导：

- 在 Phase A/B/C 全部完成前，公开 UI 不应重新对用户开放
- 前端短期应保持隐藏态
- 任何中间阶段都必须至少满足当前阶段的边界要求，而不是通过混用 legacy 与 BFF 语义来“先跑起来”

## End State

最终完成时，`Agents` 应具备以下能力：

### 1. Agent management is BFF-owned

浏览器对 Agent 的所有管理操作只通过：

- `/api/bff/agents*`

BFF 负责：

- auth
- error normalization
- contract stability
- downstream Gateway interaction isolation

### 2. Agent chat is BFF-owned

浏览器上的 Agent Chat 不再暴露 legacy `thread_id`，而是使用：

- `/workspace/agents/{agent_name}/chats/{conversation_id}`

BFF 负责：

- `conversation_id -> deerflow_thread_id` 映射
- ownership checks
- `agent_name` 注入 runtime context
- artifacts / suggestions / uploads 的统一 conversation 资源模型

### 3. Agent ownership is user-scoped

最终必须做到：

- Agent 对某个用户可见/可用的语义明确
- Agent conversation 也属于该用户
- recent list 不再展示不属于当前用户的 agent data

### 4. Bootstrap flow is conversation-based

最终 `new agent` 的保存体验应是：

- 创建 agent
- 创建 bootstrap conversation
- 通过 BFF stream route 驱动 `setup_agent`
- 保存完成后无缝进入常规 Agent Chat

## Recommended Phases

### Phase A — BFF Agent Management

**目标**：先把 Agent CRUD 管理入口收口到 BFF。\
**不解决**：Agent Chat、ownership、bootstrap conversation。

#### Scope

- `GET /agents`
- `GET /agents/check?name=...`
- `GET /agents/{agent_name}`
- `POST /agents`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`
- frontend `/api/bff/agents*`
- frontend `core/agents/api.ts` 改成走 BFF

#### Outcome

- 浏览器不再打 `/api/agents*`
- 鉴权和 contract 先统一到 BFF
- 数据语义暂时仍然是全局的

#### Why this phase exists

它的意义是：

- 先解决“入口必须经过 BFF”
- 不在一开始就把会话模型、ownership、bootstrap 全部绑在一起

### Phase B — BFF Agent Conversations

**目标**：把 Agent Chat 从 legacy thread 模型迁移到 BFF conversation 模型。\
**重点**：`thread_id -> conversation_id`，以及 bootstrap 保存流程进入 BFF。

#### Scope

- `conversations` persistence model 增加 `agent_name`
- BFF conversation schemas 暴露 `agent_name`
- `POST /agents/{agent_name}/conversations`
- BFF stream route 根据 conversation 元数据注入 `agent_name`
- frontend Agent Chat 改成 `conversation_id` 路由
- `new agent` bootstrap 保存流程 conversation 化

#### Outcome

- 浏览器不再感知 `thread_id`
- Agent Chat 和主聊天进入同一类 BFF conversation 语义
- `setup_agent` 保存流程不再依赖 legacy thread 页面

#### Why this phase exists

这是整个 roadmap 的核心阶段。只有这一步完成后，`Agents` 才真正开始摆脱 legacy thread 体系。

### Phase C — Ownership And Product Unification

**目标**：把用户隔离、recent list 语义和产品体验最终收口。\
**重点**：完成“这是一个真正能开放给用户使用的 Agents 功能”。

#### Scope

- 定义 agent ownership 模型
- 决定 BFF 是否需要 agent ownership persistence
- recent list 的最终语义
  - 普通 conversation 与 agent conversation 是否合并展示
  - 是否按 `agent_name` 分组或标签化
- Agent Gallery 的产品闭环
- bootstrap 完成态与后续聊天体验统一
- 文档与文案收口

#### Outcome

- 当前用户只能看到/使用属于自己的 agent 数据语义
- recent list 与 Agent Chat 跳转一致
- `Agents` UI 可以重新开放

#### Why this phase exists

因为即使 Phase B 完成，系统也只是完成了会话模型统一，还没有完成真正的产品级用户隔离与信息架构收口。

## Why This Breakdown Is Feasible

### Reusable foundation already exists

当前仓库里可直接复用的部分很多：

- BFF auth dependencies
- BFF conversation persistence and ownership checks
- BFF stream route and event contract
- frontend BFF chat state and recent list infra
- same-origin `/api/bff/*` bridge pattern

### What must be redesigned

需要重设计的部分也很明确：

- current `core/agents/api.ts`
- current Agent Chat route semantics
- current bootstrap save flow
- recent list semantics for agent conversations
- eventual ownership model

这说明：

- 这不是从零做一个新系统
- 也不是简单搬运旧代码
- 而是“复用 BFF 主路径基础设施，重构 Agents 的 contract 和状态模型”

## Risks And Mitigations

### Risk 1 — Phase A 被误当成最终完成

**风险**：做完 BFF CRUD 后，团队误以为 `Agents` 已经可以重新开放。\
**缓解**：明确 re-enable gate，要求至少完成 Phase B，且 ownership 方案已确定。

### Risk 2 — Phase B 把 bootstrap 和常规 Agent Chat 分成两套逻辑

**风险**：`setup_agent` conversation 和 normal agent conversation 分裂。\
**缓解**：从一开始就把 bootstrap 视为 Agent Conversation 的特例，而不是临时页。

### Risk 3 — Phase C 再谈 ownership 时发现前两阶段 contract 不够用

**风险**：前两阶段设计没给 ownership 留空间。\
**缓解**：Phase A 就只收口入口，避免假装 ownership 已解决；Phase B 明确把 `agent_name` 放进 conversation 模型，为 Phase C 留钩子。

## Re-Enable Criteria

前端 `Agents` UI 建议在以下条件满足后才重新开放：

1. **Phase A 完成**
   - 浏览器不再调用 `/api/agents*`
2. **Phase B 完成**
   - 浏览器不再暴露 `thread_id`
   - `setup_agent` 保存流程已经 conversation 化
3. **Phase C 至少完成 ownership 方案确认**
   - 即便全部产品 polish 还没收尾，也必须先明确用户隔离语义

如果这三项没有满足，建议继续保持前端隐藏。

## Future Spec Set

为了避免后续一份文档过大，建议总纲之外再维护 3 份阶段 spec：

- `Phase A — BFF Agent Management`
- `Phase B — BFF Agent Conversations And Bootstrap Flow`
- `Phase C — Ownership, Recent List, And Product Completion`

其中：

- Phase A 已经开始成型
- 下一份最值得先写的是 **Phase B**
- 因为它决定了 Agent Chat、bootstrap、以及 `conversation_id` 迁移的核心语义

## Success Criteria

这份 roadmap 写完后，应该做到：

1. 团队能理解为什么短期需要隐藏 `Agents`
2. 团队能理解为什么必须先 A 后 B 再 C
3. 每个阶段的目标、边界、交付物都清晰
4. 不再把“经过 BFF”和“用户隔离”混为一谈
5. 后续 implementation plan 可以按阶段独立展开

## Self Review

已检查：

- 这是一份总纲 roadmap，不与现有 Phase A spec 冲突
- bootstrap 保存流程已明确纳入 Phase B，而不是继续模糊后移
- ownership 被单独留到 Phase C，和你当前可接受的边界一致
- 重开 `Agents` UI 的条件明确，不会让半成品重新暴露
