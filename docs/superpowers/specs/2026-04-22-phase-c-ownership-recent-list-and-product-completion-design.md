# Phase C Ownership, Recent List, And Product Completion Design

## Goal

完成 `Agents` 路线的第三阶段收口：

- 为 `agent` 本体建立清晰的用户隔离语义
- 为 `agent conversation` 建立与主聊天一致的 ownership 语义
- 定义 `recent list` 的最终产品形态
- 把 `new agent -> bootstrap -> continue chatting` 的体验收成可正式开放给用户的产品闭环
- 给出重新开放 `Agents` 前端入口的最终标准

## Why Phase C Exists

即使 Phase A 和 Phase B 都完成，系统也仍然没有自然成为“可以开放给用户”的 Agents 产品。

原因是：

- **Phase A** 只统一了 Agent 管理入口和鉴权边界
- **Phase B** 只统一了会话模型和 bootstrap 保存路径
- 但真正决定产品是否可公开的，是下面这些问题：
  - 哪个 agent 属于哪个用户？
  - 用户能否看到别人创建的 agent？
  - recent list 里 agent conversation 和普通 conversation 怎么共存？
  - bootstrap 完成后用户会如何继续使用这个 agent？
  - Gallery / Chat / Recent List / Settings 的产品语义是否一致？

因此，Phase C 的职责不是再做一个技术迁移，而是：

> 把 ownership、信息架构和产品闭环一起做完，让 `Agents` 真正达到“可重新开放”的标准。

## Inputs From Earlier Phases

### After Phase A

已经具备：

- browser Agent CRUD 经过 BFF
- frontend 统一使用 `/api/bff/agents*`
- BFF 负责 auth 和 error normalization

但不足：

- agent 数据语义仍然可能是全局的

### After Phase B

已经具备：

- Agent Chat 外部路由使用 `conversation_id`
- `agent_name` 已进入 BFF conversation 模型
- bootstrap 保存流程进入 BFF conversation
- 浏览器不再暴露 `thread_id`

但不足：

- 仍然没有定义“agent 本体归谁所有”
- recent list 还只有“技术上可以统一”的基础，没有最终产品语义

## Core Decision

### Agent ownership must be user-scoped before the UI is reopened

这是 Phase C 的第一条硬约束。

在最终形态中：

- 每个 agent 必须有清晰的 owner 语义
- 当前用户只能看到自己有权访问的 agent
- bootstrap conversation 以及后续 agent conversations 也只能属于该用户

因此，Phase C 不是锦上添花，而是 **开放 UI 前的必要条件**。

## Ownership Design

### 1. Agent entity ownership

最终系统必须回答：

- agent 是不是一个 user-owned entity？
- 如果是，owner 信息存在哪里？
- Gateway 仍然保存实际 agent 文件/配置时，BFF 如何表达 ownership？

#### Recommended direction

采用：

- **BFF-owned ownership metadata**
- Gateway 继续作为 agent 实际内容的 downstream runtime source

也就是说：

- BFF 维护一份 agent ownership record
- BFF 决定当前用户能看到哪些 agents
- Gateway 不需要在 Phase C 承担完整 ownership 语义

这样做的原因：

- ownership 是产品和 auth 边界问题，更适合由 BFF 拥有
- 不需要把 BFF 的用户模型强行灌进 Gateway
- 可以保持 Gateway 对 agent 文件结构的专注

### 2. Minimal ownership data model

BFF 至少需要一张专门的 ownership 记录，推荐字段包括：

- `agent_name`
- `owner_user_id`
- `created_at`
- `updated_at`
- 可选：`visibility`（为未来共享能力预留，但 Phase C 默认只支持 private）

Phase C 默认产品策略建议是：

- **只支持 private agents**
- 不做团队共享 / 公共 agents

原因：

- 这样可以最小化语义复杂度
- 与“先满足用户隔离”目标完全一致

### 3. CRUD behavior after ownership is introduced

完成 Phase C 后：

- `GET /agents` → 只返回当前用户自己的 agents
- `GET /agents/{agent_name}` → 只能访问自己的 agent
- `PUT /agents/{agent_name}` → 只能更新自己的 agent
- `DELETE /agents/{agent_name}` → 只能删除自己的 agent
- `POST /agents` → 创建时自动绑定当前用户为 owner

注意：

- 这会改变 Phase A 的“全局可见”中间态
- Phase C 必须把这条产品行为变化明确写进文档和测试中

## Conversation Ownership Design

### 1. Conversation ownership remains BFF-native

这一部分的基础已经在主聊天中存在：

- conversation 由 `user_id` 拥有
- BFF 已有 ownership checks

在 Phase C 里，不需要重新发明 conversation ownership，只需要保证：

- 如果某条 conversation 带 `agent_name`
- 那么该 `agent_name` 对当前用户也必须是可访问的

也就是说：

- **conversation ownership** 看 `conversation.user_id`
- **agent accessibility** 看 `agent.owner_user_id`
- 这两者在正常流里应该一致

### 2. Consistency rule

推荐增加一条明确约束：

> 任何带 `agent_name` 的 conversation，其创建者用户必须对该 agent 有访问权。

如果出现下面情况，BFF 应拒绝：

- 当前用户访问了属于别人的 agent conversation
- conversation 指向一个当前用户不可见的 `agent_name`

这能避免因为旧数据、迁移数据或异常情况导致 UI 泄漏不属于当前用户的 agent 信息。

## Recent List Final Design

这是 Phase C 的第二个关键决策点。

### 1. Single recent list, not dual recent lists (recommended)

建议最终使用：

- **单一 recent list**
- 普通 conversations 与 agent conversations 共存在一套列表里

而不是：

- 再为 agent conversation 造第二个 recent list

原因：

- sidebar 是用户的“最近工作流”入口，而不是技术模型展示器
- conversation 已经在 Phase B 被统一为同类实体
- 两套列表只会制造更多认知负担

### 2. How agent conversations should appear

推荐展示规则：

- 普通 conversation：保持现有样式
- agent conversation：在标题行增加轻量 agent 标识
- 点击时按 `agent_name` + `conversation_id` 跳到 agent chat route

推荐表达元素：

- 小型 `Bot` 图标或 agent badge
- 或标题前加 agent 名称的弱标签

但不要：

- 再分一个独立大的 “Agent Chats” 区块
- 再创建单独的侧边栏二级导航

### 3. Sorting semantics

排序建议继续与主聊天保持一致：

- pinned first
- otherwise updated_at desc

不要因为它是 agent conversation 就额外优先，否则会破坏主聊天现有侧边栏的产品心智。

### 4. Filtering semantics

Phase C 可以考虑，但不强制首发就做：

- 按 agent 过滤 conversations
- 只看某个 agent 的 chats

如果做，也应作为增强功能，而不是重构基础导航结构。

## Bootstrap Product Flow Design

### 1. Desired end-to-end experience

在最终产品中，用户流程应是：

1. 进入 `Agents`
2. 点击新建
3. 填写基础 agent 信息
4. 系统创建 agent，并把 ownership 绑定到当前用户
5. 系统创建 bootstrap conversation
6. 用户在同一条 conversation 中完成 `setup_agent`
7. 保存完成后，conversation 不丢失，继续作为该 agent 的第一条历史会话
8. recent list 中出现该 agent conversation
9. 回到 gallery 时，agent 已可见且归属于当前用户

### 2. Why bootstrap must remain inside the same product flow

不要让 bootstrap 成为一条“临时一次性对话”，否则会产生这些问题：

- 保存完成后 recent list 语义断裂
- 用户不知道 bootstrap 那条对话去哪了
- Agent Chat 和 create-agent flow 体验割裂

所以推荐策略是：

- bootstrap conversation 就是该 agent 的第一条正式 conversation

## Reopen Criteria For The UI

前端 `Agents` UI 要重新开放，建议满足所有以下条件：

### Required

1. Phase A 完成
   - browser Agent CRUD 已完全经过 BFF
2. Phase B 完成
   - browser Agent Chat 不再暴露 `thread_id`
   - `setup_agent` 保存流程 conversation 化
3. Phase C ownership 完成
   - agents 对当前用户是隔离可见的
4. Phase C recent list 语义完成
   - agent conversation 可以在统一 recent list 中安全出现

### Nice to have but not strictly blocking

- agent badge / label 的视觉 polish
- agent filters
- 更丰富的 gallery 指标或状态

## Migration Considerations

### 1. Existing global agents

如果仓库里已经存在历史 agent 文件或配置，而它们没有 owner 信息，Phase C 需要定义迁移策略。

建议候选策略：

- **最保守策略（推荐）**：在引入 ownership 后，不自动把历史全局 agents 暴露给任何用户，只有通过明确迁移脚本认领后才可见
- **过渡策略**：允许某个 admin / local dev 用户认领历史 agents

推荐第一种，因为它最不容易误伤用户隔离边界。

### 2. Existing agent threads

如果历史上已经有 legacy agent threads：

- 不建议在 Phase C 里强行把所有老 thread 自动转成新 conversation
- 更现实的做法是：
  - 老 thread 视为历史遗留，不保证继续在新 UI 里完整可见
  - 从 Phase B/Phase C 之后创建的新 agent conversations 才是正式模型

这点要在产品和文档里说清楚，避免过度承诺。

## Risks And Mitigations

### Risk 1 — Ownership metadata and downstream agent files drift apart

**风险**：BFF 认为某 agent 属于 A，但 downstream 实际状态已被别的路径修改。\
**缓解**：所有 browser-facing CRUD 必须只走 BFF；不要再开放绕过 BFF 的 UI。

### Risk 2 — Recent list becomes visually noisy

**风险**：agent and non-agent conversations 混合后侧边栏变复杂。\
**缓解**：坚持单列表 + 轻量标识，不做大分区。必要时后续才加过滤。

### Risk 3 — Reopen too early

**风险**：Phase A/B 刚做完就想开放 UI，但 ownership 还没完成。\
**缓解**：以本 spec 的 reopen criteria 为准，不满足就继续隐藏。

## Testing Requirements

### Ownership tests

- current user only sees owned agents
- current user cannot fetch/update/delete unowned agent
- agent conversation requires both conversation ownership and agent visibility consistency

### Recent list tests

- mixed conversation list renders agent and non-agent items correctly
- agent conversation routes jump to `/workspace/agents/{agent_name}/chats/{conversation_id}`
- hidden/disabled state disappears only after ownership gates are satisfied

### Bootstrap tests

- create agent binds ownership to current user
- bootstrap conversation remains accessible after `setup_agent`
- recent list includes bootstrap/first conversation once created

## Success Criteria

Phase C 完成后，应该做到：

1. `Agents` 可以重新开放给用户
2. Agent CRUD 是 BFF-owned and user-scoped
3. Agent Chat 是 BFF conversation-based and user-scoped
4. recent list 语义统一且不会泄漏不属于当前用户的数据
5. `new agent -> bootstrap -> continue chatting` 形成完整闭环

## Self Review

已检查：

- 这份 spec 只聚焦 Phase C，不与 Phase A/B 重叠
- ownership、recent list、bootstrap 闭环都单独讲清楚了
- re-enable 条件是强约束，不会让半成品过早重新暴露
- 迁移问题被显式提出，没有假装旧数据天然兼容
