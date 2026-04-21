# Agents Temporary Disable And BFF Roadmap Design

## Goal

在 `Agents` 还没有真正收口到 BFF 之前，前端重新隐藏该功能入口和页面，避免继续暴露一套绕过 BFF 的半成品体验；同时明确后续开发路线：

- **Phase A**：先做 Agent 管理 BFF 化
- **Phase B**：再做 Agent Chat BFF 化

## Why Disable Now

当前 `Agents` 存在几个根本性问题：

1. Agent 管理仍走 Gateway-facing `/api/agents`
2. Agent Chat 仍基于 legacy `thread_id`
3. 浏览器仍然直接感知 runtime thread 语义
4. 与主聊天已经成型的 BFF conversation 模型不一致
5. 如果继续公开它，只会扩大双轨模型和鉴权边界不一致的问题

既然产品原则已经明确：

> 如果 `Agents` 不能经过 BFF，那宁愿暂时不做。

那么短期最合理的策略就是：

- 前端先隐藏
- 保留代码作为未来迁移参考
- 先把 BFF-owned 的架构方案定清楚，再重开入口

## Short-Term Product Decision

短期产品策略：

- 隐藏 sidebar 中的 `Agents` 入口
- `/workspace/agents`
- `/workspace/agents/new`
- `/workspace/agents/:agent_name/chats/:thread_id`

这些前端路由统一回退到 `AgentsDisabledState`，但**底层实现代码全部保留**。

同时：

- 不删除 `AgentGallery`、`new agent` 页、`AgentChatPage`、`core/agents/*` 等现有实现
- 保留 disabled 文案，明确说明这是因为账号隔离 / BFF ownership 尚未完成
- 最好通过一个集中式 feature flag 控制入口显示与路由回退，而不是散落在多个文件里做临时删改

这是一种**产品收口**，不是功能删除。

## Current Architecture Assessment

### Main chat today

主聊天已经具备成熟的 BFF-owned 基础设施：

- browser route: `/workspace/chats/:conversation_id`
- browser same-origin bridge: `/api/bff/conversations/*`
- BFF auth / ownership / recent list / rename / pin / delete / stream
- internal mapping: `conversation_id -> deerflow_thread_id`

这是未来 Agents 应该复用的基础。

### Agents today

当前 Agents 仍然是旧模式：

- management: `/api/agents`
- chat route: `/workspace/agents/:agent_name/chats/:thread_id`
- chat state: legacy thread hooks
- chat stream: runtime context + `agent_name`

这意味着 Agents 目前不是 BFF feature，而是混合态 legacy feature。

## Roadmap Decision

### Phase A — Agent management through BFF

目标：

- Agent 列表 / 校验名字 / 详情 / 创建 / 更新 / 删除 全部经过 BFF
- frontend 不再依赖 Gateway-facing `/api/agents`
- 浏览器只访问 `/api/bff/agents*`

建议 contract：

- `GET /agents`
- `GET /agents/check?name=...`
- `GET /agents/{agent_name}`
- `POST /agents`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`

设计要求：

- BFF 负责 auth
- BFF 负责错误归一化
- browser 不直接接触 Gateway agent schema
- 暂时不解决 Agent Chat，会与 current disabled state 共存

### Phase B — Agent chat through BFF conversations

目标：

- Agent Chat 不再暴露 `thread_id`
- Agent Chat 成为 BFF conversation 的一种变体
- `agent_name` 成为 conversation 的显式元数据

建议模型：

- `conversation.agent_name: nullable string`
  - `NULL`：普通主聊天
  - 非空：agent conversation

建议路由：

- `/workspace/agents/:agent_name/chats/new`
- `/workspace/agents/:agent_name/chats/:conversation_id`

核心行为：

- BFF 创建 agent conversation 时保存 `agent_name`
- stream 时从 conversation 元数据自动注入 `agent_name`
- browser 只感知 `conversation_id`
- recent list 统一由 BFF conversations 提供

## Why Phase A Before Phase B

先做 A 再做 B 的原因：

1. Agent 管理本身可以独立收口到 BFF
2. 它能先解决 `/api/agents` 绕过 BFF 的鉴权问题
3. Agent Chat 迁移涉及 conversation schema、recent list、route model，影响更大
4. 分阶段推进更容易验证每一步的收益和风险

## Reuse Strategy

### Can reuse

可直接复用或高度复用：

- BFF auth dependencies
- BFF route + client 分层
- main chat recent conversation list infrastructure
- frontend `/api/bff/*` same-origin bridge模式
- frontend BFF chat state / API / route conventions

### Cannot directly reuse

不能直接照搬的部分：

- 当前 `frontend/src/core/agents/api.ts`
- 当前 legacy `AgentChatPage` 的 `thread_id` 语义
- 当前 `new agent` 页的 legacy bootstrap thread 流程
- 当前 thread-based route helper 作为浏览器公开模型

## Temporary Frontend State

在 BFF 路线完成前，前端应保持以下状态：

- `Agents` 入口隐藏
- agents routes 返回统一 disabled state
- 不再继续修 Agents 当前公开体验的细节问题
- 所有后续投入都转向 BFF roadmap

这能避免继续把工程时间花在注定要废弃的公开路径上。

## Success Criteria

短期成功标准：

1. 前端用户不再看到未完成的 `Agents`
2. disabled 文案明确表达暂时关闭原因
3. 仓库中保留现有代码作为迁移参考

中期成功标准（Phase A 完成后）：

4. browser 不再使用 `/api/agents`
5. Agent 管理全部走 `/api/bff/agents*`

长期成功标准（Phase B 完成后）：

6. Agent Chat 不再暴露 `thread_id`
7. Agent Chat 与主聊天统一为 BFF conversation model
8. recent list / ownership / auth 全部统一到 BFF

## Self Review

已检查：

- 短期隐藏策略和长期 BFF roadmap 之间没有矛盾
- 明确了为什么先 A 后 B
- 范围没有漂移到不必要的 UI 细节
- 与“绕过 BFF 就宁愿不做”的产品原则一致
