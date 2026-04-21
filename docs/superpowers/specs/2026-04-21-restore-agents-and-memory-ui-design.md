# Restore Agents And Memory UI Design

## Goal

把当前分支里被隐藏的前端能力恢复到接近 `main` 分支的可用状态，包括：

- workspace 侧边栏里的 `Agents` 入口
- Agents 列表页
- 创建智能体页
- Agent Chat 页
- `Settings > Memory` 页面

恢复时优先复用 `main` 已有实现，不重复造轮子；但同时遵守当前前端目录的 same-origin 边界，不把已经收敛掉的浏览器直连 backend 写法重新带回来。

## Context

当前分支和 `main` 的差异分成两块：

### Agents

- `frontend/src/components/workspace/workspace-nav-chat-list.tsx` 移除了 `Agents` 入口
- `frontend/src/app/workspace/agents/page.tsx`、`frontend/src/app/workspace/agents/new/page.tsx`、`frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx` 都被替换成 `AgentsDisabledState`
- 但 `frontend/src/components/workspace/agents/*` 和 `frontend/src/core/agents/*` 仍然保留，可直接复用

### Memory

- `frontend/src/components/workspace/settings/settings-dialog.tsx` 移除了 `memory` section
- `frontend/src/components/workspace/settings/memory-settings-page.tsx` 被删除
- `frontend/src/core/memory/api.ts`、`hooks.ts`、`types.ts` 被删除
- 当前前端没有 `/api/memory` same-origin bridge
- DeerFlow Gateway / BFF 仍然保留 memory 能力，后端能力没有消失
- 当前 `config.yaml` 已经切到 `memory.provider=mem0`
- Gateway 的 `/api/memory*` 在 `mem0` 下要求 `X-User-Id`，因此 Memory 恢复不能只做“透明代理”，还必须把当前已登录用户映射成 mem0 user id

## Constraints

需要同时满足这几个约束：

1. UI 和交互尽量与 `main` 保持一致
2. 浏览器请求继续走 same-origin 路由，不恢复浏览器直连 backend base URL
3. 不改变 Agents 现有 `/api/agents` 协议和使用方式
4. 不把 legacy thread/BFF chat 的边界混在一起；Agent Chat 继续沿用当前项目的 runtime-thread 语义
5. Memory 在 `mem0` 模式下必须以“当前已登录用户”为作用域，不能退回全局 memory
6. 只做这次功能恢复相关的最小改动，不借机重构别的页面

## Approaches

### Option A — 机械回滚 `main` 文件

做法：直接把 `main` 的 Agents / Memory 文件整体拷回当前分支。

优点：

- 改动路径最短
- UI 最容易贴近 `main`

缺点：

- 会把 `main` 里旧的 `getBackendBaseURL()` 浏览器直连方式一并带回来
- 与当前 `frontend/AGENTS.md` 的 same-origin 边界冲突
- Memory 在 `mem0` 下仍然缺少 `X-User-Id` 处理，无法可靠读取用户记忆
- 容易把当前分支已经修过的桥接结构又绕开

### Option B — 以 `main` 为模板恢复 UI，按当前边界重接 API（推荐）

做法：

- Agents 页面、导航、交互直接恢复 `main` 的实现
- Memory 页面 UI 和 hooks 参考 `main`
- 新增当前分支缺失的 `/api/memory` same-origin bridge
- Memory API 改为请求 `/api/memory*`，不再读取 raw backend URL
- Memory bridge 在服务端解析当前已登录 BFF 用户，并把用户 id 转发成 `X-User-Id`

优点：

- 最大程度复用 `main`
- 与当前前端架构一致
- 风险主要集中在 bridge 恢复，范围清晰
- 明确兼容当前 `mem0` 用户作用域模型

缺点：

- 不是纯粹 cherry-pick，需要对 Memory API 做一层适配

### Option C — 借恢复机会把 Memory 一并迁到 BFF

做法：在恢复 UI 的同时，把 Memory ownership 从 Gateway bridge 调整成新的 BFF route。

优点：

- 从长期方向看更统一

缺点：

- 超出本次“恢复到 main 可用状态”的目标
- 需要跨前端/BFF 扩大改动面，验证成本高

## Chosen Direction

采用 **Option B**。

这条路径最符合本次目标：视觉和交互回到 `main`，实现细节遵守当前 same-origin 代理边界，且能兼容已经启用的 `mem0` 用户态记忆。

## Design

### 1. Workspace Navigation

恢复 `frontend/src/components/workspace/workspace-nav-chat-list.tsx` 中的 `Agents` 项：

- 路径仍为 `/workspace/agents`
- 高亮规则与 `main` 一致：`pathname.startsWith("/workspace/agents")`
- 文案和图标复用现有 i18n 与 `BotIcon`

这是最小且必要的入口恢复，不引入新的导航层级。

### 2. Agents Gallery

恢复 `frontend/src/app/workspace/agents/page.tsx` 使用 `AgentGallery`，而不是 `AgentsDisabledState`。

`AgentGallery` 本身已经保留，因此这一步主要是恢复路由接线：

- 保留现有 `useAgents()` 查询逻辑
- 保留“新建智能体”按钮跳转到 `/workspace/agents/new`
- 保持空态、加载态和列表布局与 `main` 一致

### 3. Create Agent Page

恢复 `frontend/src/app/workspace/agents/new/page.tsx` 的 `main` 行为：

- 第一步输入合法 agent name，并先做同名检查
- 通过 `/api/agents` 创建空 agent
- 自动进入 bootstrap chat
- 通过 `setup_agent` 流程生成/完善 agent 配置
- 在 setup tool 完成后回读 agent 详情，并提供继续聊天入口

这一页使用当前已有：

- `frontend/src/core/agents/api.ts`
- `frontend/src/core/threads/hooks.ts`
- `frontend/src/components/workspace/messages/*`

因此目标是恢复页面编排和状态机，不新增新的 domain abstraction。

### 4. Agent Chat Page

恢复 `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx` 的 `main` 行为。

它的角色是：

- 用共享聊天 UI 承载“与某个特定 agent 对话”
- 在提交消息时把 `agent_name` 放进 thread context
- 新建 agent chat 时把 `/workspace/agents/<agent>/chats/new` 替换成真实 thread 路由

页面保留 `main` 的关键交互：

- 顶部 agent badge
- `New Chat` 按钮
- `InputBox` + `MessageList` 组合
- streaming 中的 todo / artifact / export / token usage 等现有能力

这一步不改变线程协议，只恢复原先可用的 agent-specific chat shell。

### 5. Settings > Memory

恢复 `frontend/src/components/workspace/settings/settings-dialog.tsx` 里的 memory section：

- 重新引入 `MemorySettingsPage`
- 重新声明 `"memory"` section id
- 恢复 `BrainIcon`
- 保持 section 顺序尽量与 `main` 一致

`MemorySettingsPage` 本身恢复 `main` 的主要体验：

- 摘要 sections 展示
- facts 列表
- search / filter
- add / edit / delete fact
- import / export
- clear all

页面文案继续使用当前分支仍然保留的 i18n 字段。

### 6. Memory API Ownership

Memory 恢复的关键不是页面，而是 API ownership 要改成当前项目允许的 same-origin 方式，并且显式兼容 `mem0` 用户作用域。

新增：

- `frontend/src/app/api/memory/route.ts`
- `frontend/src/app/api/memory/[...path]/route.ts`

实现方式：

- 基础转发逻辑复用 `frontend/src/app/api/_gateway/proxy.ts` 的现有模式
- 但 Memory route 不能只调用透明的 `proxyGatewayRequest`
- 它需要先在服务端解析当前认证用户，再把用户 id 放进转发头部 `X-User-Id`
- 再把请求代理到 Gateway 的 `/api/memory*`
- 继续保留查询串、method、headers、body 的透明转发

用户解析策略：

- 优先复用当前前端服务端已有的认证能力，而不是在浏览器端拼用户头
- 当浏览器已经登录且 `/api/bff/me` 可解析到用户时，将该用户的 `id` 作为 `X-User-Id`
- 当用户未登录时，Memory route 返回明确的未认证错误，而不是把缺失头部的请求原样打到 Gateway 后再得到模糊失败

然后恢复：

- `frontend/src/core/memory/api.ts`
- `frontend/src/core/memory/hooks.ts`
- `frontend/src/core/memory/types.ts`

但将 `api.ts` 中的目标地址改成：

- `/api/memory`
- `/api/memory/facts/:id`
- `/api/memory/import`
- `/api/memory/export`

而不是 `main` 中的 `getBackendBaseURL()`。

## Data Flow

### Agents

1. 用户从侧边栏进入 `/workspace/agents`
2. `AgentGallery` 通过 `/api/agents` 获取 agent 列表
3. 用户进入 `/workspace/agents/new`
4. 页面先检查 name，再创建 agent
5. 页面发起 bootstrap 对话，`setup_agent` tool 完成 agent 初始化
6. 用户点击继续聊天，进入 `/workspace/agents/<name>/chats/new`
7. 首条消息发送后，页面切到 `/workspace/agents/<name>/chats/<thread_id>`

### Memory

1. 用户打开 Settings dialog 并切到 `Memory`
2. `MemorySettingsPage` 通过 `useMemory()` 调用 `/api/memory`
3. Next.js server route 先解析当前已登录用户
4. route 将 `user.id` 写入 `X-User-Id` 后代理到 Gateway `/api/memory`
5. Gateway 在 `mem0` 模式下按该用户读取专属记忆
6. 用户执行 add / edit / delete / import / clear 等操作
7. mutation 成功后更新 React Query 中的 `['memory']` cache
8. 页面立刻显示该用户的最新 memory 状态

## Error Handling

### Agents

- 延续 `main` 的 name validation 和 backend unreachable 文案
- 创建 agent 失败时给出已有错误提示，不新增新的错误模型
- `setup_agent` 完成但短时间内读不到 agent 时，保留 `main` 中的 retry + toast 提示

### Memory

- 复用 `main` 的 `readMemoryResponse()` 错误格式化逻辑
- API 返回 `detail` 时优先展示具体错误
- 导入 JSON 失败时保留客户端结构校验与 toast
- 搜索/过滤为空时显示 empty/no match，而不是异常态
- 当当前浏览器未登录或无法解析 BFF 用户时，Memory 页面应收到明确的未认证/未连接错误，而不是误显示“没有记忆”

## Testing

恢复过程中按当前仓库风格补回/改写边界测试：

1. `workspace-nav-chat-list` 再次暴露 `/workspace/agents`
2. agents routes 不再渲染 `AgentsDisabledState`
3. `settings-dialog` 再次包含 `MemorySettingsPage` 和 `"memory"` section
4. `frontend/src/core/memory/api.ts` 使用 same-origin `/api/memory`，而不是 raw backend URL
5. `frontend/src/app/api/memory/*` 的 route ownership 校验：Memory bridge 会解析当前认证用户并转发 `X-User-Id`
6. 未登录场景下 Memory bridge 返回明确错误，不把缺失用户头的请求直接透传给 Gateway

验证顺序：

- 先跑最小边界测试
- 再跑受影响的 frontend 测试集合
- 如环境允许，再补一次针对恢复页面的交互验证

## Files Expected To Change

核心预计涉及：

- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- `frontend/src/app/workspace/agents/page.tsx`
- `frontend/src/app/workspace/agents/new/page.tsx`
- `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
- `frontend/src/components/workspace/settings/settings-dialog.tsx`
- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- `frontend/src/core/memory/api.ts`
- `frontend/src/core/memory/hooks.ts`
- `frontend/src/core/memory/types.ts`
- `frontend/src/core/memory/index.ts`
- `frontend/src/app/api/memory/route.ts`
- `frontend/src/app/api/memory/[...path]/route.ts`
- 相关 boundary tests
- 相关 README / docs

## Success Criteria

完成后应满足：

1. workspace 侧边栏再次可见 `Agents`
2. `/workspace/agents` 可查看现有 agents
3. `/workspace/agents/new` 可创建 agent 并进入 bootstrap chat
4. `/workspace/agents/<agent>/chats/new` 与真实 thread chat 再次可用
5. `Settings > Memory` 可查看并编辑当前登录用户的 memory facts
6. Memory 浏览器请求全部走 same-origin `/api/memory*`
7. 在 `memory.provider=mem0` 时，Memory bridge 始终为 Gateway 提供用户态 `X-User-Id`
8. 与此次恢复相矛盾的 disabled/removed 边界测试被更新为启用态验证

## Self Review

已检查：

- 范围只覆盖“恢复到 `main` 可用状态”，没有夹带额外重构
- Agents 和 Memory 的 ownership 都明确
- Memory 特别说明了为什么不能原样恢复 `main` 的直连实现
- `mem0` 场景下的用户作用域和未登录错误都已显式覆盖
- 测试目标和成功标准与本次改动一致

暂不在 spec 里要求 git commit；是否提交版本控制由实现完成后单独决定。
