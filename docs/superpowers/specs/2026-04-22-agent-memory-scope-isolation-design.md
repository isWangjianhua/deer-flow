# Agent Memory Scope Isolation Design

## Goal

把当前 `mem0` 的“仅按 `user_id` 作用域”改成“按 `user_id + agent_id` 双重隔离”，并统一主聊天与 custom agents 的 memory 语义：

- 主聊天使用独立的主 Agent memory 空间
- 每个 custom agent 使用自己的独立 memory 空间
- `Settings > Memory` 第一阶段只展示主 Agent memory
- custom agent memory 在第一阶段默认不提供查看 UI
- 不做旧 mem0 数据兼容、迁移或回填，允许直接清理现有用户数据

## Product Decision

### 1. Memory space semantics

推荐把 memory 空间定义为：

- `user_id`：用户维度
- `agent_id`：agent 维度

每条 memory 记录都归属于一个 `(user_id, agent_id)` 组合。

### 2. Canonical agent ids

使用下面的稳定映射：

- 主聊天：`agent_id="__lead__"`
- custom agent 聊天：`agent_id=<normalized agent_name>`

这样可以避免继续把主聊天视为“无 agent 的全局空间”，而是把它显式收口成一个稳定、可推理的主 Agent 空间。

### 3. First-phase product surface

本阶段产品语义固定为：

- `Settings > Memory` = 主 Agent memory（`__lead__`）
- custom agents 的 memory 默认不可见
- 不提供 agent memory selector
- 不提供 custom agent memory 管理页

也就是说，底层已经支持多空间，但前台第一阶段只暴露主 Agent 视图。

## Why This Change Exists

当前 mem0 设计虽然已经是用户作用域，但仍然存在两个产品问题：

- 主聊天和 custom agent 聊天共享同一份 memory，导致不同 agent 之间相互污染
- `Settings > Memory` 没有明确回答“到底在看谁的 memory”

如果要把 Agents 产品和主聊天都作为长期存在的独立工作空间，就不能继续共享一份用户级 memory。

因此本次变更的核心目标不是单纯“加一个过滤条件”，而是：

> 把 memory 的产品语义从“用户唯一记忆”升级为“用户在不同 agent 工作空间中的独立记忆”。

## Current Technical Facts

### Runtime context already carries `agent_name`

当前 BFF agent chat 流已经把 `agent_name` 放进运行时上下文：

- `bff/app/api/routes/conversations.py`

这意味着 custom agent 聊天在 Gateway / harness 侧已经具备区分 agent 的输入条件。

### Memory write queue already carries `agent_name`

当前 `MemoryMiddleware` 已经把 `agent_name` 传入 memory queue：

- `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- `backend/packages/harness/deerflow/agents/memory/queue.py`

因此写入链路并不是从零开始缺少 agent 信息，而是“已有 agent_name，但 mem0 写入层还没消费它”。

### Mem0 write path still only uses `user_id`

当前 mem0 写入调用只传了：

- `messages`
- `user_id`
- `run_id=thread_id`
- `metadata.thread_id`

没有使用 `agent_name` 或 `agent_id`。

### Mem0 retrieval path still only uses `user_id`

当前 mem0 注入检索使用：

- `service.get_all(user_id=user_id)`
- `service.search(query=query, user_id=user_id)`

所以读取和写入都仍是用户级共享 memory。

### Local Mem0 SDK natively supports `agent_id`

仓库当前安装的 `mem0` SDK 原生支持：

- `add(..., user_id=..., agent_id=..., run_id=...)`
- `search(..., filters={"user_id": ..., "agent_id": ...})`
- `get_all(..., filters={"user_id": ..., "agent_id": ...})`
- `delete_all(user_id=..., agent_id=...)`

因此这次不是要发明一套新的存储协议，而是要把现有 runtime 已有的 `agent_name` 正确接到 mem0 的 `agent_id` 上。

## Approaches

### Option A — Use Mem0 native `user_id + agent_id` scoping (recommended)

做法：

- 主聊天映射到 `agent_id="__lead__"`
- custom agent 映射到 `agent_id=<agent_name>`
- mem0 写入、检索、清理全部按 `(user_id, agent_id)` 生效
- `Settings > Memory` 通过 BFF/Gateway 只读取 `__lead__`

优点：

- 与 mem0 SDK 设计一致
- 删除、检索、管理都自然成立
- 不污染 `user_id` 语义
- 后续开放 custom agent memory UI 也容易

缺点：

- 需要同时改写入链路、检索链路和 `/memory` 兼容 API

### Option B — Keep `user_id` as primary scope, use metadata `agent_name` for filtering

做法：

- 继续只传 `user_id`
- 把 `agent_name` 放进 metadata
- 读取时通过 metadata 再过滤

优点：

- 表面上改动较小

缺点：

- 容易在读取/删除/导入导出等路径上漏过滤
- 语义不如 mem0 原生实体维度稳定
- 后续扩展到 UI 管理时会更复杂

### Option C — Encode `agent_name` into `user_id`

做法：

- 主聊天使用伪造 `user_id::<lead>`
- custom agent 使用伪造 `user_id::<agent_name>`

优点：

- 改动可能看起来更快

缺点：

- 污染现有用户标识语义
- 与 BFF `X-User-Id` 边界冲突
- 会让 `/memory`、认证、审计和后续产品模型变得混乱

## Chosen Direction

采用 **Option A：Mem0 原生 `user_id + agent_id` 双维度隔离**。

这是当前代码、当前 SDK 和当前产品目标最一致的方案。

## Scope Semantics

### 1. Lead chat scope

主聊天（包括 `/workspace/chats/*`）统一归入：

- `user_id=<current_user_id>`
- `agent_id="__lead__"`

任何主聊天线程之间共享该主 Agent memory。

### 2. Custom agent scope

custom agent 聊天统一归入：

- `user_id=<current_user_id>`
- `agent_id=<normalized agent_name>`

同一 custom agent 的不同 conversation 共享 memory；不同 custom agent 之间完全隔离。

### 3. No fallback in first phase

第一阶段 **不做**：

- custom agent → user-global fallback
- lead agent → user-global fallback
- profile memory 共享层

理由：

- 产品语义必须先清晰稳定
- 你已经明确接受清理旧用户数据
- 不做 fallback 可以显著降低实现和验证复杂度

## Runtime Design

### 1. Canonical memory agent id resolver

增加一个统一解析函数，推荐语义：

- 如果 `agent_name` 为空 → `"__lead__"`
- 如果 `agent_name` 存在 → 规范化后的 `agent_name`

该函数应该成为：

- mem0 写入链路
- mem0 注入检索链路
- Gateway `/memory` 兼容 API

的统一来源，避免不同模块各自拼 scope。

### 2. Write path

当前 `MemoryMiddleware` → queue → updater 已经保留了 `agent_name`。

本次需要修改的是：

- `MemoryUpdater.aupdate_memory(...)`
- `Mem0Service.add_conversation(...)`

使 mem0 写入实际传入：

- `user_id`
- `agent_id=resolve_memory_agent_id(agent_name)`
- `run_id=thread_id`

并继续保留：

- `metadata.thread_id`
- `metadata.source`

这样可以保留 thread 级追踪信息，同时把真正的隔离语义交给 `agent_id`。

### 3. Retrieval path

当前 `Mem0InjectionMiddleware` 调用：

- `build_mem0_injection_memory(user_id=..., messages=..., thread_id=...)`

本次需要把检索路径也升级为 agent-aware：

- `build_mem0_injection_memory(user_id=..., agent_name=..., messages=..., thread_id=...)`
- `service.get_all(user_id=user_id, agent_id=resolved_agent_id)`
- `service.search(query=..., user_id=user_id, agent_id=resolved_agent_id)`

这样主聊天只能读到 `__lead__`，custom agent 只能读到自己的 agent scope。

### 4. Runtime context requirements

为了让读取链路和写入链路一致，运行时必须始终能解析出当前 scope 的 `agent_name`：

- custom agent 路径继续使用 BFF 注入的 `context.agent_name`
- 主聊天路径把 `agent_name=None` 显式视为 `__lead__`

因此不需要为主聊天额外注入新的公开字段，只需要在 memory scope resolver 中把空值映射为 `__lead__`。

## Memory API Design

### 1. Gateway compatibility routes

当前 Gateway `/api/memory` 兼容路由只接收 `user_id`。

本次建议为 Gateway memory 兼容 API 增加一个**内部作用域 header**：

- `X-User-Id: <user_id>`
- `X-Agent-Id: <agent_id>`

其中：

- `X-User-Id` 继续保持现有语义
- `X-Agent-Id` 仅作为 server-to-server / BFF-to-Gateway 的内部作用域头

Gateway memory router 在 `provider=mem0` 时：

- 没有 `X-User-Id` → 拒绝
- 有 `X-User-Id` 但没 `X-Agent-Id` → 默认使用 `__lead__`
- 有两者 → 按 `(user_id, agent_id)` 读取/修改 memory

### 2. BFF memory route

当前 BFF `GET /memory` 仍然是单一入口。

本阶段不增加 BFF public API 复杂度，保持：

- `GET /memory`

但其内部固定读取：

- `agent_id="__lead__"`

也就是说，BFF Settings Memory 视图只对主 Agent 开放。

### 3. Custom agent memory remains unexposed

本阶段 **不新增**：

- `GET /agents/{agent_name}/memory`
- `GET /memory?agent_name=...`
- 前端 memory scope selector

custom agent memory 在底层存在，但 UI 默认不可见。

## Frontend Design

### 1. Settings > Memory

`Settings > Memory` 的产品定义固定为：

- 当前登录用户的主 Agent memory
- 等价于 `(user_id, "__lead__")`

页面文案和说明应显式表达“这里展示的是主聊天记忆”，避免用户误以为包含所有 custom agents。

### 2. No custom memory UI in this phase

本阶段不改 custom agent 页面，不增加 memory 标签页，不在 agent gallery 或 agent chat 中加入 memory 管理入口。

这样可以把底层隔离先做对，再决定以后是否开放 custom agent memory 可视化。

## Data Flow

### 1. Lead chat write

```text
main chat
  -> runtime context has user_id, no agent_name
  -> memory scope resolver => agent_id="__lead__"
  -> mem0 add(messages, user_id, agent_id="__lead__", run_id=thread_id)
```

### 2. Custom agent write

```text
custom agent chat
  -> BFF stream context includes agent_name
  -> runtime context carries agent_name
  -> memory scope resolver => agent_id=<agent_name>
  -> mem0 add(messages, user_id, agent_id=<agent_name>, run_id=thread_id)
```

### 3. Lead chat retrieval

```text
before_model on main chat
  -> resolve agent_id="__lead__"
  -> mem0 get_all/search filtered by user_id + agent_id
  -> inject only lead memory into prompt
```

### 4. Settings memory retrieval

```text
browser
  -> frontend /api/bff/memory
     -> BFF /memory
        -> Gateway /api/memory with X-User-Id + X-Agent-Id="__lead__"
           -> mem0 reads only lead memory scope
```

## Compatibility / Migration

本次明确采用：

- **不迁移旧 mem0 数据**
- **不兼容旧 user-only mem0 记录**
- **允许直接清理现有用户 memory 数据后上线新语义**

这意味着：

- 现有 `deerflow_mem0` 中只按 `user_id` 写入的历史数据可以忽略
- 上线前可直接清空现有相关数据或重建 collection
- 新写入的数据从上线时开始使用 `(user_id, agent_id)` 语义

## Non-Goals

本阶段不包含：

- custom agent memory 页面
- memory scope selector
- lead/custom 间 memory fallback
- 历史 mem0 数据回填或迁移工具
- 把所有 `Settings > Memory` 操作扩展到 custom agent
- 共享 agent / 团队级 memory

## Risks And Mitigations

### Risk 1 — Scope resolver drifts across modules

**风险**：写入、检索、Gateway API 各自解析 `agent_id`，导致 scope 不一致。  
**缓解**：用一个统一 helper 解析 memory scope，禁止散落拼接。

### Risk 2 — Hidden custom memory confuses users later

**风险**：底层已经写了 custom memory，但用户在 UI 看不到。  
**缓解**：这是本阶段有意产品边界；文档中明确 `Settings > Memory` 只代表主 Agent。

### Risk 3 — Main chat accidentally falls back to user-global memory

**风险**：某些路径没传 `agent_name`，又错误地继续按旧 user-only 逻辑读取。  
**缓解**：主聊天固定解析为 `__lead__`，不允许“无 agent_id 的 mem0 检索路径”继续存在。

### Risk 4 — Existing `/api/memory` semantics stay ambiguous

**风险**：虽然底层隔离了，但 API 仍被误认为“返回全部 memory”。  
**缓解**：把 BFF 和文档都明确成“主 Agent memory route”。

## Testing Requirements

### Runtime write tests

- 主聊天写入 mem0 时传 `agent_id="__lead__"`
- custom agent 写入 mem0 时传 `agent_id=<agent_name>`
- `thread_id` 继续作为 `run_id` / metadata 保留

### Runtime retrieval tests

- 主聊天注入 memory 只能看到 `__lead__` scope
- custom agent 注入 memory 只能看到自己的 agent scope
- 不同 custom agents 之间互不可见

### Gateway/BFF API tests

- Gateway `/api/memory` 在 mem0 模式下支持 `X-Agent-Id`
- BFF `/memory` 固定读取 `__lead__`
- 浏览器 `/api/bff/memory` 不会泄露 custom agent memory

### Product tests

- `Settings > Memory` 只显示主 Agent memory
- custom agents 在第一阶段没有可见 memory UI
- 主聊天与 custom agent 聊天之间不会互相读到对方记忆

## Success Criteria

上线后，系统应该满足：

- 主聊天拥有独立于 custom agents 的 memory 空间
- 每个 custom agent 拥有独立于其他 agents 的 memory 空间
- `Settings > Memory` 稳定表示主 Agent memory
- 旧用户级共享 memory 语义完全退出运行时主路径
- 不需要历史迁移逻辑也能稳定工作
