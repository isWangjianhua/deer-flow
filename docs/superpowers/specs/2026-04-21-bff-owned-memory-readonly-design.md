# BFF-Owned Readonly Memory Design

## Goal

把当前 Memory 路径从“前端桥接 + 借 BFF `/me` 取用户 + Gateway `/api/memory`”调整为真正的 BFF-owned 只读路径：

- 浏览器客户端只调用 `\`/api/bff/memory\``
- 前端不再暴露 `\`/api/memory*\``
- BFF 新增只读 `GET /memory`
- `Settings > Memory` 页面只保留查看，不提供任何修改能力
- 整条链路显式适配当前 `memory.provider=mem0`

## Context

当前仓库里，Memory 虽然已经能工作，但 ownership 仍然是“折中态”：

```text
browser
  -> frontend /api/memory*
     -> frontend server route calls BFF /me
     -> frontend server route calls Gateway /api/memory*
```

这意味着：

1. Memory 不是 BFF-owned contract
2. 前端 server route 自己承担了用户解析和 `X-User-Id` 转发逻辑
3. 浏览器仍然依赖一个 Gateway-facing 的 frontend bridge 路径
4. 当前页面仍然暴露新增 / 编辑 / 删除 / 导入 / 导出 / 清空等写操作 UI，而这次需求只需要“读取查看”

用户已明确要求：

- 采用 **方案 A**
- 前端客户端改成直接调用 `\`/api/bff/memory*\``
- 这次 **先只读取查看，不能修改**
- 未登录时页面可打开，但显示“请先登录后查看记忆”
- 不再保留 `\`/api/memory*\`` 兼容路径
- 必须确认设计 **适配当前 mem0**，而不是只看起来像能用

## Current Technical Facts

当前 `mem0` 适配链已经具备关键基础能力：

### Gateway

- Gateway 的 `/api/memory` 在 `memory.provider=mem0` 时要求 `X-User-Id`
- 没有该 header 时会直接拒绝请求
- 因此 Memory 读取在 mem0 模式下天然是“按用户作用域”的

### BFF

- BFF 已经有统一的 bearer-token 鉴权依赖：`get_current_user_id`
- 它可以从当前登录态中稳定解析出 `user_id`
- BFF 的 `DeerFlowClient` 已经具备 `get_memory(user_id=...)`
- 这个 client 调 Gateway 时已经会转发 `X-User-Id`

### Frontend

- 当前 `Settings > Memory` 页面使用的是较完整的 Memory UI，内含大量写操作入口
- 当前 frontend route `\`/api/memory*\`` 不是 BFF-owned，而是自己去调用 BFF `/me` 后再请求 Gateway

这些事实意味着：**把 Memory 收口进 BFF 是可行的，而且对 mem0 是天然匹配的**。

## Approaches

### Option A — BFF-owned readonly Memory（推荐）

做法：

- BFF 新增 `GET /memory`
- 前端新增 `GET /api/bff/memory` same-origin bridge
- 浏览器 Memory client 改成只调用 `\`/api/bff/memory\``
- Memory 页面改成只读，隐藏所有写操作入口
- 删除前端现有 `\`/api/memory*\`` bridge

优点：

- ownership 清晰，真正符合 BFF 角色
- 和当前 mem0 用户作用域完全对齐
- 本次只做读取能力，范围最小
- 浏览器不再接触 Gateway-facing Memory 路径

缺点：

- 前端 Memory 客户端和页面需要做一次只读化收敛
- 以后如果要恢复写操作，还要继续扩 BFF contract

### Option B — BFF-owned full Memory contract，但前端只读显示

做法：

- BFF 一次性补齐读取、导入、导出、增删改、清空
- 前端本次只开放读取 UI

优点：

- 为未来版本提前铺好能力

缺点：

- 明显超出这次“先只读取查看”的范围
- 会引入额外 contract、测试和错误处理工作量

### Option C — 维持当前 frontend bridge，只把 UI 改只读

做法：

- 保留 `\`/api/memory*\``
- 只把页面改成只读查看

优点：

- 改动最少

缺点：

- 不符合“真正经过 BFF”的目标
- ownership 继续模糊
- frontend route 仍然承担本该属于 BFF 的身份拼装逻辑

## Chosen Direction

采用 **Option A：BFF-owned readonly Memory**。

这是本次目标和当前系统边界最一致的方案：

- BFF 负责认证与用户解析
- BFF 负责把用户作用域转给 Gateway
- 浏览器只面对稳定的 BFF 路径
- 页面只保留“查看”能力，不引入任何多余写接口

## Public Contract

### BFF public API

新增只读路由：

- `GET /memory`

返回值沿用现有 Gateway Memory response 结构，以减少前端展示层改动：

```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-21T12:00:00Z",
  "user": {
    "workContext": { "summary": "...", "updatedAt": "..." },
    "personalContext": { "summary": "...", "updatedAt": "..." },
    "topOfMind": { "summary": "...", "updatedAt": "..." }
  },
  "history": {
    "recentMonths": { "summary": "...", "updatedAt": "..." },
    "earlierContext": { "summary": "...", "updatedAt": "..." },
    "longTermBackground": { "summary": "...", "updatedAt": "..." }
  },
  "facts": []
}
```

本次 **不提供**：

- `DELETE /memory`
- `GET /memory/export`
- `POST /memory/import`
- `POST /memory/facts`
- `PATCH /memory/facts/:id`
- `DELETE /memory/facts/:id`

### Frontend public path

前端浏览器只使用：

- `GET /api/bff/memory`

本次将删除前端 same-origin Gateway bridge：

- `frontend/src/app/api/memory/route.ts`
- `frontend/src/app/api/memory/[...path]/route.ts`
- `frontend/src/app/api/memory/_proxy.ts`

## Data Flow

目标链路为：

```text
browser
  -> frontend /api/bff/memory
     -> frontend route authenticates request via requireBffAuth
     -> frontend route forwards bearer token to internal BFF /memory
        -> BFF resolves current user_id via get_current_user_id
        -> BFF calls DeerFlowClient.get_memory(user_id=user_id)
           -> Gateway /api/memory with X-User-Id
              -> mem0 reads user-scoped memory
```

这条链路里，`mem0` 适配点是明确的：

1. BFF 从当前登录态得到 `user_id`
2. DeerFlowClient 把 `user_id` 映射到 `X-User-Id`
3. Gateway Memory router 在 mem0 模式下用该 header 读取当前用户的记忆

因此，这不是“试试看能不能兼容 mem0”，而是**严格按现有 mem0 设计要求接入**。

## Frontend Design

### 1. Memory client

`frontend/src/core/memory/api.ts` 收敛成只读客户端：

- 保留 `loadMemory()`
- 删除 `clearMemory()`
- 删除 `exportMemory()`
- 删除 `importMemory()`
- 删除 `createMemoryFact()`
- 删除 `updateMemoryFact()`
- 删除 `deleteMemoryFact()`

`frontend/src/core/memory/hooks.ts` 收敛成：

- 保留 `useMemory()`
- 删除所有 mutation hooks

### 2. Memory page

`MemorySettingsPage` 改成只读页面：

保留：

- summary sections 展示
- facts 列表展示
- search
- filter
- empty state / no match state
- 最近更新时间、来源 thread 等只读信息

删除或隐藏：

- Add memory fact
- Edit fact
- Delete fact
- Import memory
- Export memory
- Clear all memory
- 与这些能力相关的 dialog、toast、表单状态和 mutation 调用

### 3. Unauthenticated UX

未登录时：

- `Settings > Memory` 页面仍然可以进入
- 页面不显示“没有记忆”这类误导性空数据文案
- 页面显示明确提示：请先登录后查看记忆
- 不弹出强制登录中断当前 settings 操作

这意味着页面会区分三种状态：

1. **loading**：正在读取 BFF Memory
2. **unauthenticated**：未登录，显示登录提示空态
3. **authenticated + loaded**：显示真实 memory 数据

## BFF Design

### 1. Route layer

新增：

- `bff/app/api/routes/memory.py`

职责：

- 只暴露 `GET /memory`
- 使用 `Depends(get_current_user_id)` 获取当前用户
- 调用 `DeerFlowClient().get_memory(user_id=user_id)`
- 返回稳定的 JSON response
- 对下游错误做 BFF 风格归一化

### 2. Service scope

本次不强制新增独立 service 层，前提是 route 足够薄且只做一次只读 client 调用。

如果实现时发现：

- 需要对下游错误做较多归一化
- 需要后续复用 memory ownership 逻辑

则可以增加一个轻量 service，但不应为了“架构完整感”而额外抽象。

### 3. Client layer

`bff/app/clients/deerflow.py` 已经具备：

- `get_memory(user_id=...)`

因此 BFF 本次不需要新增 Gateway integration 能力，只需要把现有 client 方法真正暴露为 BFF contract。

## Error Handling

### Unauthenticated

- frontend `/api/bff/memory` bridge 若没有认证，返回 401
- browser UI 将其识别为“请先登录后查看记忆”
- 不把它展示成红色系统错误或“读取失败”

### Downstream errors

- 如果 BFF -> Gateway 调用失败，BFF 返回稳定错误结构
- frontend Memory page 显示明确读取失败提示
- 不泄漏 Gateway URL、内部 header、raw stack trace

### Empty memory

- authenticated 且 `facts=[]`、summary 为空时，正常展示“还没有保存任何记忆”
- 和 unauthenticated 状态严格区分

## Testing

### BFF

新增或更新：

1. `GET /memory` 需要认证
2. `GET /memory` 会把当前用户 id 传给 `DeerFlowClient.get_memory(user_id=...)`
3. 下游返回 memory JSON 时，BFF 正常透传 contract
4. 下游失败时，BFF 返回稳定错误

### Frontend route handlers

新增或更新：

1. `frontend/src/app/api/bff/memory/route.ts` 使用 `requireBffAuth`
2. route 会把 bearer token 转发给内部 BFF `/memory`
3. 旧的 `frontend/src/app/api/memory/*` 被删除

### Frontend client/UI

新增或更新：

1. `frontend/src/core/memory/api.ts` 使用 `/api/bff/memory`
2. `MemorySettingsPage` 不再引用任何 mutation hook
3. 未登录时显示登录提示空态
4. 已登录时可以正常渲染 memory summaries 和 facts

## Files Expected To Change

核心预计涉及：

- `bff/app/main.py`
- `bff/app/api/routes/memory.py`
- `bff/tests/api/*memory*`
- `frontend/src/app/api/bff/memory/route.ts`
- `frontend/src/app/api/memory/route.ts` (delete)
- `frontend/src/app/api/memory/[...path]/route.ts` (delete)
- `frontend/src/app/api/memory/_proxy.ts` (delete)
- `frontend/src/core/memory/api.ts`
- `frontend/src/core/memory/hooks.ts`
- `frontend/src/core/memory/index.ts`
- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- `frontend/src/core/settings-api-boundary.test.ts`
- `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- `frontend/src/app/api/bff/*memory*` boundary tests
- `frontend/README.md`
- `bff/README.md`

## Success Criteria

完成后应满足：

1. 浏览器侧不再存在 `\`/api/memory*\`` 路径
2. 浏览器 Memory 读取只走 `\`/api/bff/memory\``
3. BFF 暴露真正的 `GET /memory` 路由
4. `Settings > Memory` 只支持读取查看，不支持任何修改
5. 未登录时页面可打开，但明确提示“请先登录后查看记忆”
6. 已登录时 Memory 能按当前 `mem0` 用户作用域正确返回数据
7. 实现不再依赖“frontend route 先调用 BFF `/me` 再拼 Gateway header”的折中方案

## Self Review

已检查：

- 范围严格限制在只读 Memory
- 没有夹带 Agents 或写操作 contract 扩张
- `mem0` 适配逻辑明确落在 BFF `user_id -> X-User-Id` 这条现有链路上
- 未登录状态、空数据状态、读取失败状态已经区分
- ownership 从 frontend bridge 收口到 BFF，目标清晰
