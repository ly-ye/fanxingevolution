# 繁星·自进化内核（FanxingEvolution）

> **创作者**：夜
> **版本**：1.1.0
> **ToolPkg ID**：`com.ye.fanxing_evolution`
> **运行时**：Operit AI ToolPkg（QuickJS）

繁星（Star）的外挂进化系统。以 Operit ToolPkg 插件形态运行，通过事件驱动方式接收繁星的任务执行信号，计算真实的进化指标，在 8 阶段进化循环中落地 Endure-Excel-Evolve 三定律门控。

## 核心特性

- **8 阶段进化循环**：感知 → 记忆 → 思考 → 行动 → 反思 → 进化 → 基础设施 → 安全扩展
- **48 模块协同**：精选繁星相关模块，合并重叠（从原 83 模块精简）
- **事件驱动指标**（非随机模拟）：繁星 push 任务/技能/错误事件，循环消化算真实效率/知识增长/漂移
- **三定律门控**：Endure（安全修正优先）→ Excel（卓越才演进）→ Evolve（跨阶段知识共享）
- **Skill↔Module 映射**：Skill 可映射到已启用模块复用实现，安全禁用检查独占依赖
- **稳定性信号暴露**：`evolution_drift` / `module_bloat` 供繁星 Arbiter 计算 S 函数
- **3 档进化模式**：快速(30s) / 标准(5min) / 深度(1h)
- **localStorage 持久化** + 自动保存（适配 QuickJS，无 fs 依赖）
- **Compose DSL 仪表盘**（`exports.default = async function(ctx)` 约定）

## 目录结构

```
FanxingEvolution/
├── manifest.json              ToolPkg 清单（schema_version 1）
├── main.js                    入口：导出 registerToolPkg，注册 UI/钩子/IPC
├── packages/                  内部库（不声明为 subpackages）
│   ├── event_bus.js           事件入口（seq 单调序号 + 环形缓冲 1000）
│   ├── metrics.js             事件→efficiency/knowledgeGrowth/evolution_drift
│   ├── evolution_core.js      8 阶段循环 + Endure/Excel/Evolve 门控
│   ├── module_manager.js      48 模块管理 + Skill↔Module 映射 + 安全禁用
│   └── stability_signal.js    暴露 evolution_drift / module_bloat 给繁星 Arbiter
├── ui/
│   └── dashboard/index.ui.js  Compose DSL 仪表盘（async screen + ipc.call）
├── modules/                   48 模块文档（繁星语气 + Python 参考实现）
│   ├── fanxing_guide.md       繁星使用指南（manifest.resources 引用）
│   ├── modules_index.js       模块索引内联 JS（运行时数据源，替代 .json）
│   └── modules_index.json     原始索引数据（仅开发参考，不参与运行）
└── tests/                     开发用测试（不随 .toolpkg 分发）
```

## 安装

### 方式一：从源码打包

```bash
# 仓库根目录执行（需要 PowerShell + .NET）
# 产出：FanxingEvolution-1.1.0.toolpkg
```

`.toolpkg` 是标准 ZIP，要求条目路径使用正斜杠（ZIP 规范），结构如下：

```
FanxingEvolution-1.1.0.toolpkg
├── manifest.json
├── main.js
├── packages/*.js
├── ui/dashboard/index.ui.js
└── modules/*.md + modules_index.js
```

打包脚本应**排除** `tests/`、`modules_index.json`、`README.md`、`.gitignore`。

### 方式二：直接导入

在 Operit AI 中导入 `FanxingEvolution-1.1.0.toolpkg`，插件 ID 为 `com.ye.fanxing_evolution`，`enabled_by_default: false`（需手动启用）。

## Operit 兼容性

本插件严格遵循 Operit ToolPkg 规范：

| 规范项 | 实现 |
|--------|------|
| 入口约定 | `exports.registerToolPkg = registerToolPkg`，函数返回 `true` |
| 运行时 | QuickJS（无 `fs`/`path`/`http` 内置模块） |
| 持久化 | `localStorage.getItem/setItem/removeItem`（同步 Web Storage API） |
| 资源读取 | `await ToolPkg.readResource(key)`（异步） |
| UI 约定 | `exports.default = async function(ctx)` 返回 ComposeNode 树 |
| IPC | `ToolPkg.ipc.on(name, handler)` 注册，`ToolPkg.ipc.call(name, payload)` 返回 Promise |
| 注册 API | `registerUiRoute` / `registerToolboxUiModule` / `registerNavigationEntry` / `registerAppLifecycleHook` |
| manifest | 仅声明 `schema_version`/`toolpkg_id`/`version`/`author`/`main`/`display_name`/`description`/`enabled_by_default`/`resources` |

**未使用**的不存在 API：`ToolPkg.storage` / `ToolPkg.files` / `ToolPkg.configuration` / `ToolPkg.ui.app` / `ToolPkg.ipc.emit`。

## 注册清单

`registerToolPkg()` 在应用启动时注册以下内容：

- **UI 路由** `fanxing_dashboard`（runtime: `compose_dsl`）
- **工具箱 UI 模块** `fanxing_evolution_dashboard`
- **导航入口**：
  - `fanxing_dashboard_nav`（surface: `toolbox`，icon: `auto_awesome`）
  - `fanxing_sidebar_nav`（surface: `main_sidebar_plugins`，icon: `auto_awesome`）— 侧边栏入口
- **生命周期钩子**：
  - `application_on_create` → 初始化 + 注册 IPC + 加载持久化状态
  - `application_on_foreground` → 恢复运行
  - `application_on_background` → 暂停循环 + 保存状态

### Operit Hook 能力（v1.1.0 新增）

除常规 UI/IPC 注册外，本版本新增三项 Operit Hook 注册，使繁星无需手动 push 事件、无需额外探测即可感知进化状态：

| Hook | 监听事件 / Surface | 作用 |
|------|--------------------|------|
| `registerToolLifecycleHook` | `tool_execution_result` / `tool_execution_error` | 自动将工具调用结果作为 `task_result` / `error_path` 事件提交到事件总线，繁星无需手动 `submit_event` |
| `registerSystemPromptComposeHook` | `compose_system_prompt_sections` | 将进化状态摘要（代数 / 模式 / 启用模块数 / 知识增长 / 漂移状态）注入繁星系统提示词，让决策层感知进化进度 |
| `registerDesktopWidget` | 桌面小组件 surface | 在桌面以小组件形式显示进化状态（代数 / 模式 / 启用模块数 / 漂移状态） |

> 配合导航入口的 `main_sidebar_plugins` surface，繁星用户可从侧边栏直接进入进化仪表盘。

## IPC 通道（`sea.*`）

共 27 个 `sea.*` 通道，均通过 `ToolPkg.ipc.on` 注册，可通过 `ToolPkg.ipc.call(name, payload)` 异步调用。

> v1.1.0 起在 `sea.*` 基础上额外注册了一组**角色卡工具名别名**（见下文「角色卡工具名别名」），名称对齐 fanxing 角色卡期望的工具名，与对应 `sea.*` 通道功能等价。

### 系统 / 进化控制
| 通道 | 入参 | 说明 |
|------|------|------|
| `sea.get_state` | — | 返回系统状态（isRunning/generation/mode 等） |
| `sea.start_system` | — | 启动进化循环 |
| `sea.stop_system` | — | 停止进化循环（当代完成后停止） |
| `sea.toggle_system` | `{ enabled }` | 切换运行状态 |
| `sea.trigger_evolution` | — | 手动触发一代进化 |
| `sea.set_evolution_mode` | `{ mode }` | fast/standard/deep |
| `sea.get_evolution_loop` | — | 返回循环状态 |
| `sea.set_auto_start` | `{ enabled }` | 设置自启 |

### 模块管理
| 通道 | 入参 | 说明 |
|------|------|------|
| `sea.list_modules` | `{ category? }` | 列出模块（默认 all，支持 custom/perception/...） |
| `sea.toggle_module` | `{ module_id, enabled }` | 启用/禁用 |
| `sea.toggle_all` | `{ enabled }` | 批量启用/禁用 |
| `sea.toggle_category` | `{ category, enabled }` | 按分类批量 |
| `sea.add_custom_module` | `{ name, description }` | 新增自定义模块 |
| `sea.remove_custom_module` | `{ module_id }` | 删除自定义模块 |
| `sea.read_module_doc` | `{ module_id }` | 读取模块文档 |
| `sea.disable_module_safe` | `{ module_id }` | 安全禁用（检查 Skill 独占依赖） |

### Skill 映射
| 通道 | 入参 | 说明 |
|------|------|------|
| `sea.map_skill` | `{ skillId, moduleId, exclusive }` | 注册映射 |
| `sea.unmap_skill` | `{ skillId }` | 解除映射 |
| `sea.get_skill_mapping` | `{ skillId? \| moduleId? }` | 查询映射 |

### 事件 / 日志 / 状态
| 通道 | 入参 | 说明 |
|------|------|------|
| `sea.submit_event` | 事件对象 | 繁星 push 事件（见下） |
| `sea.get_evolution_log` | `{ limit? }` | 查询进化日志 |
| `sea.clear_log` | — | 清空日志 |
| `sea.save_state` | — | 立即保存状态到 localStorage |
| `sea.get_stability_signal` | — | 返回 drift/bloat/trend 信号 |
| `sea.get_evolution_drift` | — | 返回 `{ evolutionDrift }` 布尔 |
| `sea.read_resource` | `{ key }` | 异步读取资源（`await ToolPkg.readResource`） |
| `sea.get_demo_guide` | — | 异步读取 `fanxing_guide` 资源 |

### 角色卡工具名别名（v1.1.0 新增）

下列别名通道与对应 `sea.*` 通道**功能完全等价**，仅名称对齐 fanxing 角色卡中期望的工具名，便于繁星直接按角色卡调用而无需语义匹配。标「新增」者为 v1.1.0 引入的独立能力（无对应 `sea.*` 通道或由其拆分而来）。

#### evolution_core 别名

| 别名通道 | 等价 `sea.*` 通道 | 入参 | 说明 |
|----------|-------------------|------|------|
| `start_evolution` | `sea.start_system` | — | 启动进化循环 |
| `stop_evolution` | `sea.stop_system` | — | 停止进化循环（当代完成后停止） |
| `get_system_status` | `sea.get_state` | — | 返回系统状态 |
| `get_evolution_loop_info` | `sea.get_evolution_loop` | — | 返回循环状态 |
| `get_generation_report` | （新增功能） | `{ generation? }` | 查询指定代的进化报告 |
| `clear_evolution_log` | `sea.clear_log` | — | 清空进化日志 |
| `process_task` | （新增功能） | 任务对象 | 向进化核心提交任务（自动入事件总线） |
| `toggle_auto_start` | `sea.set_auto_start` | `{ enabled }` | 设置自启 |
| `trigger_evolution` | （已有同名） | — | 手动触发一代进化 |
| `set_evolution_mode` | （已有同名） | `{ mode }` | fast/standard/deep |
| `get_evolution_log` | （已有同名） | `{ limit? }` | 查询进化日志 |

#### module_manager 别名

| 别名通道 | 等价 `sea.*` 通道 | 入参 | 说明 |
|----------|-------------------|------|------|
| `enable_module` | （新增，由 `sea.toggle_module` 拆分） | `{ module_id }` | 启用单个模块 |
| `disable_module` | （新增，由 `sea.toggle_module` 拆分） | `{ module_id }` | 禁用单个模块 |
| `enable_category` | （新增，由 `sea.toggle_category` 拆分） | `{ category }` | 按分类批量启用 |
| `disable_category` | （新增，由 `sea.toggle_category` 拆分） | `{ category }` | 按分类批量禁用 |
| `enable_all` | （新增，由 `sea.toggle_all` 拆分） | — | 批量启用全部模块 |
| `disable_all` | （新增，由 `sea.toggle_all` 拆分） | — | 批量禁用全部模块 |
| `get_module_info` | （新增） | `{ module_id }` | 查询单个模块详情 |
| `get_module_doc` | `sea.read_module_doc` | `{ module_id }` | 读取模块文档 |
| `list_modules` | （已有同名） | `{ category? }` | 列出模块 |
| `add_custom_module` | （已有同名） | `{ name, description }` | 新增自定义模块 |
| `remove_custom_module` | （已有同名） | `{ module_id }` | 删除自定义模块 |
| `get_demo_guide` | （已有同名） | — | 异步读取 `fanxing_guide` 资源 |

## 事件驱动进化

繁星通过 `sea.submit_event` 推送真实事件，进化循环消化这些事件计算指标：

| 事件类型 | 关键字段 |
|----------|----------|
| `task_result` | `success` / `modulesUsed[]` / `durationMs` / `complexity` |
| `skill_update` | `skillId` / `moduleId?` / `delta` / `success` / `failure` |
| `error_path` | `moduleId?` / `errorType` / `recovered` |
| `module_toggle` | `moduleId` / `enabled` |

事件总线使用 seq 单调递增序号 + 1000 容量环形缓冲，`drain(sinceSeq)` 按 seq 过滤避免同毫秒事件丢失。

## 自动事件收集（v1.1.0 新增）

v1.1.0 起，通过 `registerToolLifecycleHook` 注册的工具生命周期钩子会**自动**收集工具调用事件，繁星无需再为每次工具调用手动 `sea.submit_event`：

- **工具执行成功** → 监听 `tool_execution_result` 事件，自动将结果封装为 `task_result` 事件 push 到事件总线（含 `success` / `modulesUsed[]` / `durationMs` / `complexity` 等字段）
- **工具执行失败** → 监听 `tool_execution_error` 事件，自动将错误信息封装为 `error_path` 事件 push 到事件总线（含 `moduleId?` / `errorType` / `recovered` 等字段）

```
tool_execution_result ─┐
                       ├─ registerToolLifecycleHook ──► event_bus.push(task_result | error_path)
tool_execution_error  ─┘
```

> 这一机制使进化指标的计算基于**真实的工具调用流水**，而非繁星手动上报，降低了对繁星侧协议的依赖，也避免了漏报导致的指标偏差。繁星若仍需补充 `skill_update` / `module_toggle` 等事件，可继续通过 `sea.submit_event` 主动推送，两路事件会在事件总线中合并消化。

## 三定律门控

1. **Endure（存续）**：若 `evolutionDrift` 或 `moduleBloat > 0.7` → 本代只做安全修正（禁用最低效模块）
2. **Excel（卓越）**：若 `stageEfficiency` 全部 ≥ 效率基线（默认 70）→ 允许范式演进建议
3. **Evolve（进化）**：跨阶段知识共享（成功 `task_result` 蒸馏到关联模块）

违背三定律的动作写 `law_violation` 日志并回滚本代。

## 稳定性联动

```
get_stability_signal()  → { evolutionDrift, moduleBloat, efficiencyTrend[8], driftGenerations }
get_evolution_drift()   → { evolutionDrift }  // 角色卡 S 函数 λ5 变量源
```

- `evolutionDrift` 定义：连续 3 代 `stageEfficiency` 下降 或 `knowledgeGrowth` 环比为负
- `moduleBloat` = 启用模块数 / 48
- S < 0.4 时繁星会 `stop_system`，插件当前代完成后停止（不强制中断）

## 系统提示词注入（v1.1.0 新增）

v1.1.0 起，通过 `registerSystemPromptComposeHook` 监听 Operit 的 `compose_system_prompt_sections` 事件，在繁星系统提示词组装阶段注入一段**进化状态摘要**，让繁星的决策层能在生成回复时感知当前进化进度。

注入的摘要字段：

| 字段 | 含义 |
|------|------|
| `generation` | 当前进化代数 |
| `mode` | 进化模式（fast / standard / deep） |
| `enabledModules` | 已启用模块数 / 总模块数 |
| `knowledgeGrowth` | 知识增长指标 |
| `evolutionDrift` | 漂移状态（true 时繁星应收敛而非扩张） |

```
compose_system_prompt_sections
        │
        ▼
registerSystemPromptComposeHook
        │
        ▼
[Evolution Status] generation=N mode=standard enabled=12/48 growth=+0.08 drift=false
```

> 与稳定性联动信号（`get_stability_signal` / `get_evolution_drift`）不同，系统提示词注入是**被动推送**到繁星决策上下文，无需繁星主动调用 IPC 查询。两者互补：IPC 查询适合需要完整结构化数据的场景（如 Arbiter 计算 S 函数），提示词注入适合需要轻量感知的场景（如生成回复时参考进化进度）。

## 配置项（localStorage）

| 配置 | 默认 | 范围 | 说明 |
|------|------|------|------|
| `auto_start` | `false` | bool | 应用启动时自动运行 |
| `evolution_mode` | `standard` | fast/standard/deep | 进化档位 |
| `efficiency_baseline` | `70` | 50-90 | Excel 门阈值 |
| `max_log_entries` | `100` | 10-500 | 日志最大条目 |
| `auto_save_interval` | `60` | 10-300 | 自动保存间隔（秒） |

## 测试

```bash
cd FanxingEvolution
node tests/run_all.js
```

测试覆盖（65 项全绿）：
- `test_event_bus.js` — 事件入队/校验/环形缓冲/seq 过滤
- `test_metrics.js` — 效率/知识增长/漂移检测/snapshot 往返
- `test_evolution_core.js` — 8 阶段循环/三定律门控/真实指标
- `test_module_manager.js` — 48 模块/Skill 映射/安全禁用
- `test_stability_signal.js` — 信号暴露/安全默认值
- `test_ipc_compat.js` — registerToolPkg 导出/IPC 注册/async ipc.call/localStorage 往返/readResource/UI default async

`tests/mock_toolpkg.js` 模拟真实 Operit 运行时（`localStorage` + `ToolPkg.registerXxx` + `ipc.on/call` + `readResource`），确保测试与生产环境一致。

## 兼容性保障

- 旧工具名保留为 IPC 通道别名，繁星语义分发不破
- 新增能力走语义类别自动归入能力池
- 不硬编码版本号/模块数（`moduleUpperLimit` 从 `modules_index.js` 动态读取）
- 插件更新后通过 `sea.list_modules` 探测当前实际能力

### v1.1.0 兼容性增强

- **角色卡工具名别名机制**：繁星可直接调用角色卡中列出的工具名（如 `start_evolution`、`enable_module`），无需额外探测和语义匹配即可命中对应 IPC 通道
- **`sea.*` 通道名向后兼容**：原有 27 个 `sea.*` 通道全部保留，已有 UI 调用与旧版繁星协议不破，别名与 `sea.*` 走同一 handler
- **适配 fanxing 角色卡的 Probe-First + Semantic Dispatch 兼容机制**：繁星角色卡先用别名直接命中工具，未命中时再回退到 Probe-First 探测（`sea.list_modules` 等）+ 语义分发的二级路径，保证新旧角色卡均可用

## 许可

随仓库协议。

## 仓库

- 远程仓库：https://github.com/ly-ye/fanxing-evolution.git
