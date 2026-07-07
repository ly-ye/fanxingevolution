# 繁星·自进化内核使用指南

> **创作者**：夜
> **版本**：1.0.0
> **插件 ID**：FanxingEvolution

## 概述

繁星·自进化内核是繁星（Star）的外挂进化系统，以 Operit ToolPkg 插件形态运行。它不是繁星本身，而是繁星身后的进化引擎——通过事件驱动方式接收繁星的任务执行信号，计算真实的进化指标，在 8 阶段进化循环中落地 Endure-Excel-Evolve 三定律门控。

**核心特性**：
- 8 阶段进化循环：感知 → 记忆 → 思考 → 行动 → 反思 → 进化 → 基础设施 → 安全扩展
- 48 个模块协同（精选繁星相关，合并重叠）
- 事件驱动指标（非随机模拟）：繁星 push 任务/技能/错误事件，循环消化算真实效率/知识增长/漂移
- 三定律门控：Endure（安全修正优先）→ Excel（卓越才演进）→ Evolve（跨阶段知识共享）
- Skill↔Module 映射：Skill 可映射到已启用模块复用实现，安全禁用检查独占依赖
- 稳定性信号暴露：evolution_drift / module_bloat 供繁星 Arbiter 计算 S 函数
- 3 档进化模式：快速(30s) / 标准(5min) / 深度(1h)
- 状态持久化 + 自动保存
- Compose DSL 仪表盘

## 启动进化系统

### 方式一：UI 启动
1. 打开 Operit → 工具箱 → 繁星·自进化内核
2. 概览页点击「启动进化」
3. 系统开始按 8 阶段循环

### 方式二：工具调用
```
start_evolution()
```
激活后永久自启动，按当前进化模式周期循环。

## 进化模式

| 模式 | 间隔 | 适用场景 |
|------|------|----------|
| fast | 30秒 | 实时调试、快速验证 |
| standard | 5分钟 | 日常运行（默认） |
| deep | 1小时 | 深度优化、长时间进化 |

切换：
```
set_evolution_mode({mode: "deep"})
```

## 事件驱动进化（关键）

繁星通过 `submit_event` 推送真实事件，进化循环消化这些事件计算指标：

### 事件类型

| 类型 | 触发时机 | 关键字段 |
|------|----------|----------|
| `task_result` | 繁星完成一步任务 | `success` / `modulesUsed[]` / `durationMs` / `complexity` |
| `skill_update` | Skill 权重变更 | `skillId` / `moduleId?` / `delta` / `success` / `failure` |
| `error_path` | 工具失败/重试/能力缺口 | `moduleId?` / `errorType` / `recovered` |
| `module_toggle` | 繁星启停模块 | `moduleId` / `enabled` |

### 示例：推送任务结果
```
submit_event({
  type: "task_result",
  success: true,
  modulesUsed: ["memory", "knowledge_graph"],
  durationMs: 1200,
  complexity: 0.6
})
```

### 指标计算
- **moduleEfficiency**：成功率加权（成功 +0.5，失败 −1.0，近 20 次窗口）
- **stageEfficiency**：阶段活跃模块效率均值
- **knowledgeGrowth**：成功任务复杂度和 − 错误路径 × 0.1
- **evolutionDrift**：连续 3 代效率下降或知识负增长 → true
- **moduleBloat**：启用模块数 / 48

## 三定律门控

进化循环每代依次穿过三道门：

1. **Endure（存续）**：若 evolutionDrift 或 moduleBloat>0.7 → 本代只做安全修正（压缩低效模块权重，不扩展能力）
2. **Excel（卓越）**：若 stageEfficiency 全部 ≥ 效率基线(默认70) → 允许范式演进建议
3. **Evolve（进化）**：跨阶段知识共享（成功 task_result 蒸馏到关联模块）

违背三定律的动作写 `law_violation` 日志并回滚本代。

## 模块管理

### 列出模块
```
list_modules({category: "all"})      // 全部
list_modules({category: "perception"}) // 按阶段
list_modules({category: "custom"})   // 自定义
```

### 启停模块
```
enable_module({module_id: "memory"})
disable_module({module_id: "memory"})
```

### 安全禁用（推荐）
检查是否有独占映射的活跃 Skill 依赖：
```
safe_disable_module({module_id: "memory"})
// 若有依赖，返回 {success:false, reason:"skill_dependent", dependents:[...]}
```

### 分类批量
```
enable_category({category: "evolution"})
disable_category({category: "security"})
```

### 自定义模块
```
add_custom_module({name: "我的模块", description: "..."})
remove_custom_module({module_id: "custom_..."})
```

## Skill↔Module 映射

Skill 可映射到已启用模块复用其实现：

### 注册映射
```
map_skill_module({
  skillId: "data_analysis",
  moduleId: "knowledge_graph",
  exclusive: true
})
```

### 查询映射
```
get_skill_mapping({skillId: "data_analysis"})
// 或查某模块被哪些 Skill 依赖
get_skill_mapping({moduleId: "memory"})
```

### 解除映射
```
unmap_skill_module({skillId: "data_analysis"})
```

**安全禁用规则**：`safe_disable_module` 会检查目标模块是否有 `exclusive:true` 的活跃 Skill 依赖，有则拒绝禁用并返回 dependents 列表。非独占映射或无依赖时正常禁用。

## 稳定性信号

繁星 Arbiter 读取这些信号计算 S 函数：

```
get_stability_signal()
// 返回 {evolutionDrift, moduleBloat, efficiencyTrend[8], driftGenerations}

get_evolution_drift()
// 返回布尔值（角色卡 S 函数 λ5 变量源）
```

S<0.4 时繁星会 `stop_evolution`，插件当前代完成后停止（不强制中断）。

## 进化日志

```
get_evolution_log({limit: 50})
clear_evolution_log()
get_generation_report()   // 当代报告
get_system_status()       // 系统状态
get_evolution_loop_info() // 8阶段循环详情
```

## 配置项

| 配置 | 类型 | 默认 | 说明 |
|------|------|------|------|
| auto_start | boolean | false | 应用启动时自动运行 |
| evolution_mode | enum | standard | fast/standard/deep |
| efficiency_baseline | number | 70 | Excel 门阈值(50-90) |
| max_log_entries | number | 100 | 日志最大条目(10-500) |
| auto_save_interval | number | 60 | 自动保存间隔秒(10-300) |

## 手动触发

```
trigger_evolution()  // 立即跑一代循环（不影响周期调度）
```

注意：Skill 更新不应直接 `trigger_evolution`，只写事件由周期循环消化。仅复盘阶段由 Arbiter 评估后触发一次。

## 按任务类型的模块启用策略（参考）

- 编码任务：code_generation / self_improver / test_automation / llm_integration
- 分析任务：causal_reasoning / debate_reasoning / benchmark_evaluator
- 鸿蒙任务：harmony_agent / domain_adapter
- 工具创造：tool_creator / tool_extender / skill_market
- 多智能体任务：multi_agent_topology / agent_communication

启用前先 `list_modules` 确认模块存在（插件更新后模块名可能变更）。

## 兼容性

- 旧工具名全部保留，繁星语义分发不破
- 新增工具走语义类别自动归入能力池
- 不硬编码版本号/模块数/工具数
- 插件更新后通过 `list_*` 探测当前实际能力

## 生命周期钩子

- 安装时：初始化默认模块状态
- 启用时：加载持久化状态，按 auto_start 决定是否启动
- 禁用时：停止循环，保存状态
- 卸载时：停止循环，清理存储
- 应用前台：恢复定时器
- 应用后台：暂停定时器，保存状态
