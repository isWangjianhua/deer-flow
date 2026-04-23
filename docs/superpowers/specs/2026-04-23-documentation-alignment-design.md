# Documentation Alignment And Refresh Design

## Goal

在不调整现有文档结构的前提下，完成一次面向当前仓库 reality 的文档纠偏与补全，让新读者、维护者和贡献者都能更快建立一致的项目心智模型。

本次设计重点不是“重写整个文档体系”，而是：

- 保留根目录多语言 README 结构
- 保留 `backend`、`bff`、`frontend` 现有入口文档结构
- 保留 `frontend` 使用文档站内容而不是 `frontend/docs/` 的事实
- 以当前代码实现为准，修正文档中的过时边界、运行模式和责任划分

## Why This Work Is Needed

当前仓库已经形成了比较清晰的三层产品架构：

- `frontend`
- `bff`
- `backend`（Gateway + Harness）

但文档仍然存在以下问题：

1. 不同入口文档对系统边界的描述粒度不一致
2. 部分文档仍然保留旧的运行路径心智模型
3. Gateway 的运行面已经包含 thread-based runs 与 stateless runs，但不一定在所有入口文档中表达清楚
4. `BFF` 现在已经拥有 `conversation_id`、用户作用域 conversation contract、agent ownership 相关能力，部分文档仍然描述得偏旧
5. `frontend` 的“内部文档”现实上是 `README + src/content/*`，但这一点并没有被统一表达
6. 多语言根 README 与服务级文档容易出现内容漂移

如果不先做这一层入口对齐，继续新增功能只会让“哪里是当前事实来源”越来越模糊。

## Constraints

本次更新遵守以下边界：

- **不改文档目录结构**
- **不重命名现有核心文档文件**
- **不把历史 RFC / plan / handoff 文档重写成当前主文档**
- **不尝试一次性重写前端英文文档站全部页面**
- **不扩展成完整多语言文档站翻译项目**

这意味着本次工作是“入口统一化 + 核心事实补全”，不是 IA 重构。

## Current Documentation Topology

当前仓库的主要文档层次如下：

### 1. Repository-level docs

根目录文档负责仓库入口与对外介绍：

- `README.md`
- `README_zh.md`
- `README_ja.md`
- `README_fr.md`
- `README_ru.md`
- `Install.md`
- `CONTRIBUTING.md`
- `SECURITY.md`

### 2. Backend docs

`backend` 采用典型的 `README + docs/` 结构：

- `backend/README.md`
- `backend/docs/README.md`
- `backend/docs/ARCHITECTURE.md`
- `backend/docs/API.md`
- 以及若干专题文档

### 3. BFF docs

`bff` 采用较轻量的 `README + docs/` 结构：

- `bff/README.md`
- `bff/docs/README.md`
- `bff/docs/ARCHITECTURE.md`
- `bff/docs/API.md`
- `bff/docs/DEVELOPMENT.md`
- `bff/docs/ROADMAP.md`

### 4. Frontend docs

`frontend` 没有单独的 `frontend/docs/`，而是采用：

- `frontend/README.md`
- `frontend/src/content/en/*`
- `frontend/src/content/zh/*`

其中 `src/content/en/` 才是前端正式文档站主内容。

### 5. Historical design docs

`docs/` 与 `docs/superpowers/*` 下保留历史方案、阶段设计、实施计划和 handoff。这些文档继续保留，但不应替代当前入口文档成为第一事实来源。

## Canonical Architecture Truths To Align

本次文档更新必须统一以下事实。

### 1. Product topology

当前产品主路径应统一描述为：

`Browser -> Frontend -> /api/bff/* -> BFF -> Gateway/Harness`

同时补充说明：

- nginx `:2026` 是 canonical 本地入口
- `make dev` 是 standard mode
- `make dev-pro` 是 gateway mode
- gateway mode 下 dedicated LangGraph server 被跳过，由 Gateway 暴露兼容运行面

### 2. Backend boundary

`backend` 内部需要持续明确区分：

- `backend/packages/harness/deerflow/` 是可复用 runtime harness
- `backend/app/` 是 Gateway 与 IM channels app layer

并保持依赖方向：

- `app.*` 可以 import `deerflow.*`
- `deerflow.*` 不能 import `app.*`

### 3. Gateway runtime surfaces

Gateway 当前并不只有一种运行接口，而是至少包含：

- thread-based runs：
  - `/api/threads/{thread_id}/runs`
  - `/api/threads/{thread_id}/runs/stream`
  - `/api/threads/{thread_id}/runs/wait`
- stateless runs：
  - `/api/runs/stream`
  - `/api/runs/wait`

其中 stateless runs 的实际行为不是“完全无线程”，而是：

- 如请求显式提供 `config.configurable.thread_id`，则复用该线程
- 否则自动生成临时 thread

### 4. BFF ownership

`BFF` 当前已经拥有下列产品边界：

- 当前用户认证
- public `conversation_id`
- `conversation_id -> deerflow_thread_id` 映射
- conversation ownership checks
- browser-facing chat stream contract
- readonly lead-agent memory contract
- browser-facing agent CRUD boundary
- user-scoped agent ownership filtering

文档必须把这些能力讲清楚，而不是继续把 BFF 写成一个仅做简单转发的薄层。

### 5. Frontend documentation reality

前端部分必须统一表达：

- `frontend/README.md` 是服务级入口
- `frontend/src/content/en/` 是正式文档站主内容
- 当前中文内容明显少于英文内容
- 当前前端产品主路径是 BFF-first，但仍有少量 same-origin bridge 到 Gateway 的边界保留

## Recommended Update Scope

本次更新分两层进行。

### Layer 1: Must-update entry docs

这批文档必须更新，用来统一入口心智模型。

#### Root

- `README.md`
- `README_zh.md`
- `README_ja.md`
- `README_fr.md`
- `README_ru.md`

#### Service README

- `backend/README.md`
- `bff/README.md`
- `frontend/README.md`

#### Service doc indexes

- `backend/docs/README.md`
- `bff/docs/README.md`
- `frontend/src/content/en/index.mdx`
- `frontend/src/content/en/application/index.mdx`
- `frontend/src/content/en/reference/source-map.mdx`

### Layer 2: Must-update core technical docs

这批文档负责补齐核心实现事实。

- `backend/docs/ARCHITECTURE.md`
- `backend/docs/API.md`
- `bff/docs/ARCHITECTURE.md`
- `bff/docs/API.md`

如果在更新过程中发现个别 README 必须引用 `Install.md`、`Makefile` 命令或前端文档站页面，也可以做最小必要补链，但不新增大范围专题页。

## Documentation Strategy

### Approach A: Minimal line edits only

只修明显错误句子，不统一叙事模板。

优点：

- 风险最低
- 改动最少

缺点：

- 文档之间的边界表达仍然会继续漂移
- 新读者很难在多个入口之间建立一致认知

### Approach B: Keep structure, unify entry narratives

保留当前目录与文件，只统一入口文档的表达模板。

推荐模板：

- 这部分是什么
- 它负责什么
- 它不负责什么
- 本地如何启动/接入
- 先读哪些文档

优点：

- 不打破现有结构
- 能显著提升文档一致性
- 最适合当前仓库的状态

缺点：

- 需要跨多个入口文件做同步校对

### Approach C: Full documentation overhaul

重构 README、文档站导航和专题拆分。

不推荐本次采用，因为它已经超出“内容纠偏和补全”的范围。

## Recommended Approach

本次采用 **Approach B**。

核心原则是：

> 保持结构不变，但让所有入口文档都说同一套当前事实。

这意味着：

- 根 README 负责仓库级定位和快速启动
- 服务 README 负责服务边界与阅读路径
- 核心技术文档负责真实实现细节
- 历史设计文档继续保留，但不抢入口位置

## Per-Surface Content Plan

### Root multilingual READMEs

目标：

- 统一项目定位
- 统一三服务拓扑描述
- 统一推荐启动方式
- 统一文档导航入口

允许保留语言差异，但核心事实必须一致。

### Backend docs

目标：

- 更明确地区分 Harness 与 Gateway
- 明确两种运行面：thread runs 与 stateless runs
- 明确 standard mode 与 gateway mode
- 让 `ARCHITECTURE.md` 与 `API.md` 能支撑当前维护者快速定位代码

### BFF docs

目标：

- 更明确说明 BFF 的“产品 contract shaping”角色
- 明确 conversation mapping、ownership、agent visibility 的职责
- 把“BFF 不拥有什么”写清楚，防止与 Gateway/Harness 责任混淆

### Frontend docs

目标：

- 把 README 与 docs content 的关系讲清楚
- 让文档站入口页与 source map 对当前代码边界更贴近
- 统一表达 main chat / account / agents / memory 等主路径的 BFF-first 事实

## Risks And Mitigations

### Risk 1: README 之间再次漂移

缓解：

- 先以英文 `README.md` 为主源
- 其他语言 README 只做同结构同步，不做自由扩写

### Risk 2: 文档写得太深，超出入口职责

缓解：

- README 只讲定位、边界、启动和跳转
- 详细实现留给 `ARCHITECTURE.md` / `API.md`

### Risk 3: 前端文档站与服务 README 叙述冲突

缓解：

- 先统一术语：`conversation_id`、`thread_id`、`agent_name`、`BFF-first`
- 更新 `frontend/src/content/en/index.mdx` 与 `source-map.mdx` 作为前端事实总入口

### Risk 4: 历史设计文档继续被误用为当前真相

缓解：

- 在服务级 README 和 docs index 中明确“先看哪些 current docs”
- 不把 `docs/superpowers/*` 当作入口链接主路径

## Acceptance Criteria

本次文档更新完成后，应满足：

1. 根目录 5 份多语言 README 对项目定位、拓扑、启动方式和文档入口的描述一致
2. `backend/README.md`、`bff/README.md`、`frontend/README.md` 都能独立回答“这个服务是什么、负责什么、怎么启动、先看哪里”
3. `backend/docs/ARCHITECTURE.md` 和 `backend/docs/API.md` 明确包含 thread-based runs 与 stateless runs 的现实
4. `bff/docs/ARCHITECTURE.md` 和 `bff/docs/API.md` 能清楚表达 conversation mapping、ownership、agent visibility 的产品边界
5. 前端入口文档能清楚表达 `README + docs content` 的双层结构，以及当前 BFF-first 产品路径
6. 主要入口文档之间的术语保持一致：
   - `conversation_id`
   - `thread_id`
   - `agent_name`
   - `standard mode`
   - `gateway mode`
   - `BFF-first`

## Out Of Scope

以下内容不属于本次设计范围：

- 重构文档目录
- 批量重写 `docs/superpowers/*`
- 全量补齐前端中文文档站
- 新建大规模专题文档体系
- 调整运行时代码实现

## Result

这次工作应产出一组“更像同一个项目写出来的”入口文档：

- 对外 README 不再只讲旧心智模型
- 服务级 README 不再互相重复但边界模糊
- 核心技术文档与当前代码实现对齐
- 新同学可以先从入口文档建立正确全局图，再进入各服务细节
