# Hide Empty Memory Summary Sections Design

## Goal

当当前用户的 Memory 里只有 facts、而 `用户上下文 / 历史背景` 六个 summary 槽位都为空时，前端自动隐藏这些空的 summary 区域，让 `Settings > Memory` 只显示有信息量的 facts 视图。

## Context

当前 Memory 页面已经改为只读，并且 BFF-owned Memory 读取链路已经成立：

```text
browser
  -> /api/bff/memory
  -> BFF /memory
  -> Gateway /api/memory
  -> mem0
```

现在的 `mem0` 兼容层返回结构里：

- `facts` 会从 mem0 实际结果构建出来
- `user.workContext / personalContext / topOfMind`
- `history.recentMonths / earlierContext / longTermBackground`

这六个 summary 槽位在当前实现中经常是空字符串。

因此页面会出现一种体验问题：

- facts 区域有真实内容
- summary 区域只是空占位
- `全部 / 摘要 / 事实` 三个筛选里，`摘要` 和 `全部` 在这种场景下没有实际价值
- `summaryReadOnly` 文案会误导用户，以为 summary 只是“只读”，而不是“当前根本没有数据”

用户要求采用“方案 2”：

- **只有在 summary 全空时才隐藏**
- facts 继续保留
- 以后如果 summary 真有内容，自动恢复显示

## Approaches

### Option A — 永久隐藏 summary 区

做法：

- 直接删掉 summary 区域与 `摘要/全部` 筛选
- 页面永久只显示 `事实`

优点：

- 最简单
- UI 永远稳定

缺点：

- 将来后端补了 summary，也无法显示
- 过度收缩了页面能力

### Option B — summary 全空时自动隐藏（推荐）

做法：

- 继续保留现有 summary 渲染能力
- 但当 `isMemorySummaryEmpty(memory)` 为真时：
  - 不渲染 summary 区域
  - 不渲染 `摘要` 筛选
  - `全部` 退化为无意义选项，因此也不显示
  - 页面直接只展示 `事实`
- 当 summary 有任意一项非空时，恢复完整视图

优点：

- 当前体验更干净
- 将来 summary 一旦有值，无需再改代码
- 改动最小、风险最低

缺点：

- 页面结构会随数据状态变化

### Option C — 保留 summary 区，但替换成说明文案

做法：

- 不显示空 summary 卡片
- 用一条说明替代，例如“摘要暂未生成，当前仅展示事实”

优点：

- 能解释为什么看不到 summary

缺点：

- 仍然保留一块“空信息区”
- 比直接隐藏更占视觉空间

## Chosen Direction

采用 **Option B：summary 全空时自动隐藏**。

这最符合当前产品状态：

- 不显示没有信息量的空 summary 区
- 保留未来恢复 summary 展示的能力
- 改动仅限前端显示层，不需要碰 BFF / Gateway / mem0 写入逻辑

## UX Design

### 1. 当 summary 全空时

页面行为：

- 隐藏“用户上下文”区块
- 隐藏“历史背景”区块
- 隐藏 `摘要` 筛选按钮
- 隐藏 `全部` 筛选按钮
- 默认只显示 `事实`
- 隐藏 `summaryReadOnly` 那条说明文案

在这种状态下，Memory 页就是一个“facts-only readonly viewer”。

### 2. 当 summary 有任意内容时

页面行为恢复为当前完整版：

- 显示 summary sections
- 显示 `全部 / 摘要 / 事实` 三种筛选
- 显示 `summaryReadOnly` 文案

### 3. 其他状态不变

以下行为保持不变：

- 未登录时显示登录提示空态
- 加载中状态
- 读取失败状态
- facts 搜索与筛选
- facts 列表显示、来源 thread 链接、时间格式化保护

## Implementation Design

只改前端 Memory 页面和相邻边界测试。

### Page logic

在 `MemorySettingsPage` 中：

- 复用现有 `isMemorySummaryEmpty(memory)`
- 新增派生布尔值，例如：

```ts
const summariesAvailable = memory ? !isMemorySummaryEmpty(memory) : false;
```

- summary 显示条件从：

```ts
const showSummaries = filter === "all" || filter === "summaries";
```

调整为：

```ts
const showSummaries =
  summariesAvailable && (filter === "all" || filter === "summaries");
```

- facts 显示继续保留，但当 `summariesAvailable === false` 时，筛选控件只保留 `事实`
- `summaryReadOnly` 文案只在 `summariesAvailable === true` 时显示

### Filter behavior

当 `summariesAvailable === false` 时：

- 初始 `filter` 仍可保留现有默认值，但渲染时只显示 `事实`
- 或在 effect / derived render 中把可见视图等价为 `facts`

为了最小改动，优先推荐：

- 不额外引入 effect
- 仅通过渲染条件把 UI 收窄到 facts-only

## Testing

更新边界测试，验证：

1. `isMemorySummaryEmpty` 仍被页面使用
2. 页面在 summary 全空场景下不会强制保留 `摘要` 入口
3. 只读和未登录逻辑仍然保留
4. 当前时间保护逻辑不回退

这次不需要新增 BFF 或 Gateway 测试，因为后端 contract 不变。

## Files Expected To Change

- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`

## Success Criteria

完成后应满足：

1. 当 summary 六个槽位都为空时，页面不再显示“用户上下文 / 历史背景”
2. 这种场景下页面只显示 `事实`
3. `摘要` 和 `全部` 筛选不再出现
4. facts 列表和未登录状态保持正常
5. 一旦未来 summary 有内容，这些区块会自动恢复显示

## Self Review

已检查：

- 范围只在前端显示层，没有扩展到后端
- 方案与用户明确选择的“方案 2”一致
- 没有把 summary 永久删死，未来可自动恢复
- 测试目标聚焦当前行为变化，没有引入无关改动
