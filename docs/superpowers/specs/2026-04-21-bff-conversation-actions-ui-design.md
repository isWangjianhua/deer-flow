# BFF Conversation Actions UI Design

## Goal

把 BFF 聊天侧边栏里的 `置顶 / 重命名 / 删除` 做得更克制、更统一，和当前项目 `main` 分支的侧边栏风格保持一致，同时保留已经实现的功能能力。

## Context

当前实现已经支持：

- 会话重命名
- 会话真正删除
- 会话置顶/取消置顶
- 删除确认弹窗

但现状存在几个视觉问题：

1. 置顶会话被单独拆成一个区块，视觉重量过高
2. 会话列表行本身承担了过多状态表达，显得不够轻
3. 确认弹窗和列表菜单在气质上比 `main` 分支更“功能性”，不够精致
4. 整体和项目现有 sidebar 风格的一致性不足

## Reference Review

对照 `main` 分支 `frontend/src/components/workspace/recent-chat-list.tsx` 的实现，这个项目现有 sidebar 的视觉原则是：

- 单列列表
- 弱分组
- 文本优先
- 悬浮时才暴露次级操作
- 低装饰、轻状态表达

这意味着新的置顶 UI 不应该引入更重的结构层级，也不应该把列表做成多区块卡片式结构。

## Approaches

### Option A — 轻分区置顶

做法：保留 `Pinned` 小标题，但样式非常轻，仅作为一行弱标签。

优点：

- 语义清晰
- 用户一眼能知道哪些是置顶

缺点：

- 仍然会把一个原本简单的列表拆成两个区块
- 对当前项目来说视觉层级还是偏重

### Option B — 单列表 + 左侧小 pin 标记（推荐）

做法：不再单独分区，只在同一个 `Recent chats` 列表中把置顶项排序到最前；置顶项标题左侧加一个很小、低对比度的 pin 图标。

优点：

- 最符合项目现有 sidebar 风格
- 保留功能，但不抢视觉焦点
- 与 ChatGPT 等成熟聊天产品的侧边栏心智更接近

缺点：

- 用户第一次看不如分区式明显
- 需要更精细地控制 icon 尺寸、间距、颜色，否则容易显得杂乱

### Option C — 强分区置顶

做法：保留独立置顶区，并明显强化视觉，比如额外背景、标签、边距层次。

优点：

- 功能感知最强

缺点：

- 与当前项目整体风格冲突最大
- 很容易显得“像新拼进去的一块 UI”

## Chosen Direction

采用 **Option B：单列表 + 左侧小 pin 标记**。

## Visual Design

### 1. 列表结构

保留一个 `Recent chats` 列表，不增加 `Pinned` 独立区块。

排序规则：

1. 置顶会话排在前面
2. 置顶会话之间按 `pinned_at desc`
3. 非置顶会话按 `updated_at desc`

### 2. 置顶标记

置顶会话在标题左侧增加一个非常轻的小 pin 图标：

- 尺寸小于菜单操作图标
- 使用 `muted` 风格颜色
- 与标题保持紧凑间距
- 不增加背景、不加 badge、不改单行高度

视觉目标：

- 正常浏览时能看见，但不抢标题本身
- 只有在用户留意时才强化“这是置顶项”

### 3. 会话行布局

沿用当前项目的基础会话行结构：

- 左侧：pin（仅置顶项显示）+ 标题
- 右侧：hover 时显示 `...` 菜单
- 激活态、hover 态、文字颜色继续沿用现有 sidebar token

### 4. 菜单设计

菜单项顺序：

1. `Pin chat` / `Unpin chat`
2. `Rename`
3. `Delete`

其中：

- `Pin/Unpin` 是一级动作，但不需要额外强调色
- `Delete` 仍然保留危险语义
- 菜单整体宽度和圆角继续与当前项目一致

### 5. 删除确认弹窗

保留现有确认流程，但在视觉上收紧：

- 继续使用项目已有 `Dialog`
- 不增大尺寸
- 保持简洁标题
- 内容只保留必要确认文案和当前会话标题
- 主按钮保持红色危险态，取消按钮为 outline

目标：

- 看起来像项目既有确认弹窗的一部分
- 而不是一个“信息很多”的管理弹窗

## Behavior

### Pin / Unpin

- 从 `...` 菜单触发
- 成功后列表立即重排
- 当前会话如果被置顶，只移动位置，不改变当前路由

### Rename

- 继续使用已有 rename dialog
- 弹窗尺寸和输入密度保持克制

### Delete

- 继续使用已有 delete confirm dialog
- 删除成功后：
  - 若删除的是当前会话，跳转到相邻会话或 `/workspace/chats/new`
  - 若删除的是非当前会话，仅从列表中移除

## Implementation Notes

### Frontend

主要改动集中在：

- `frontend/src/components/workspace/recent-chat-list.tsx`

实现重点：

- 去掉置顶独立 section 的渲染结构
- 改成单列表排序渲染
- 把 pin 图标融入标题行，而不是额外增加块级结构
- 精简菜单层级和弹窗密度

### Backend

后端 pin/unpin 持久化已经存在，无需改变接口语义。

## Testing

保留和补充以下回归覆盖：

- pin/unpin API helper
- sidebar 仍然有 pin/unpin action
- sidebar 不再渲染独立 pinned section
- delete confirm 仍保持 destructive action

## Success Criteria

重构完成后应满足：

1. 功能不变：置顶、取消置顶、重命名、删除都可用
2. 视觉更统一：和 `main` 分支 sidebar 风格一致
3. 结构更简单：不再有独立 `Pinned` 区块
4. 置顶状态更轻：只通过顺序 + 小 pin 表达
5. 删除确认仍清晰，但不显得臃肿
