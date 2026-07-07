/*
 * 繁星·自进化内核 - 进化循环核心
 * 8 阶段进化循环，事件驱动消化，Endure/Excel/Evolve 三定律门控
 * 创作者：夜
 */

(function () {
  "use strict";

  // 8 阶段定义（对齐 modules_index.json 的 stage 分配）
  var EVOLUTION_STAGES = [
    { id: "perception", name: "感知", order: 1 },
    { id: "memory", name: "记忆", order: 2 },
    { id: "thinking", name: "思考", order: 3 },
    { id: "action", name: "行动", order: 4 },
    { id: "reflection", name: "反思", order: 5 },
    { id: "evolution", name: "进化", order: 6 },
    { id: "infrastructure", name: "基础设施", order: 7 },
    { id: "security", name: "安全扩展", order: 8 }
  ];

  var MODE_INTERVALS = { fast: 30000, standard: 300000, deep: 3600000 };
  var MODULE_UPPER_LIMIT = 48;
  var BLOAT_THRESHOLD = 0.7;

  var runtime = {
    state: null,        // main.js 注入的 systemState
    eventBus: null,
    metrics: null,
    moduleManager: null,
    timerId: null,
    lastCycleTimestamp: 0,
    efficiencyBaseline: 70,
    evolutionMode: "standard",
    autoStart: false,
    maxLogEntries: 100,
    logCallbacks: []
  };

  function _setRuntime(opts) {
    runtime.state = opts.state || runtime.state;
    runtime.eventBus = opts.eventBus || runtime.eventBus;
    runtime.metrics = opts.metrics || runtime.metrics;
    runtime.moduleManager = opts.moduleManager || runtime.moduleManager;
    if (opts.efficiencyBaseline !== undefined) runtime.efficiencyBaseline = opts.efficiencyBaseline;
    if (opts.evolutionMode) runtime.evolutionMode = opts.evolutionMode;
    if (opts.autoStart !== undefined) runtime.autoStart = opts.autoStart;
    if (opts.maxLogEntries) runtime.maxLogEntries = opts.maxLogEntries;
  }

  function _getStagesWithModules() {
    // 从 moduleManager 动态获取每阶段模块列表
    var mm = runtime.moduleManager;
    if (!mm || typeof mm.getModulesByStage !== "function") {
      return EVOLUTION_STAGES.map(function (s) { return { id: s.id, name: s.name, modules: [] }; });
    }
    return EVOLUTION_STAGES.map(function (s) {
      var mods = mm.getModulesByStage(s.id).map(function (m) { return m.id; });
      return { id: s.id, name: s.name, modules: mods };
    });
  }

  function _getEnabledModulesMap() {
    var mm = runtime.moduleManager;
    var map = {};
    if (mm && typeof mm.list_modules === "function") {
      var all = mm.list_modules({ category: "all" });
      if (all && all.modules) {
        all.modules.forEach(function (m) { map[m.id] = !!m.enabled; });
      }
    }
    return map;
  }

  function _countEnabledModules() {
    var map = _getEnabledModulesMap();
    var c = 0;
    for (var k in map) if (map[k]) c++;
    return c;
  }

  function _addLog(type, message, data) {
    var st = runtime.state;
    if (!st) return;
    if (!st.evolutionLog) st.evolutionLog = [];
    var entry = {
      generation: st.generation || 0,
      timestamp: Date.now(),
      type: type,
      message: message,
      data: data || null
    };
    st.evolutionLog.unshift(entry);
    if (st.evolutionLog.length > runtime.maxLogEntries) {
      st.evolutionLog.length = runtime.maxLogEntries;
    }
    runtime.logCallbacks.forEach(function (cb) {
      try { cb(entry); } catch (e) { /* 忽略回调错误 */ }
    });
  }

  /**
   * 执行一次进化循环（8 步）
   */
  function performEvolutionCycle() {
    var st = runtime.state;
    var eb = runtime.eventBus;
    var mt = runtime.metrics;
    if (!st || !eb || !mt) {
      _addLog("system", "进化循环跳过：依赖未就绪");
      return { success: false, reason: "not_ready" };
    }

    runtime.lastCycleTimestamp = Date.now();
    var preSnapshot = mt.snapshot(); // 事前快照（用于回滚）
    var lawViolation = false;

    try {
      // 1. 拉取 event_bus 自上次循环以来的新事件（用 seq 避免同毫秒冲突）
      var events = eb.drain(st.lastDrainedSeq || 0);
      if (events.length > 0) {
        st.lastDrainedSeq = events[events.length - 1].seq;
      }
      _addLog("cycle_start", "第" + (st.generation + 1) + "代开始，消化" + events.length + "个事件");

      // 2. metrics.recompute → 更新效率/知识增长/漂移
      var stagesWithMods = _getStagesWithModules();
      var enabledMap = _getEnabledModulesMap();
      var recomp = mt.recompute(events, stagesWithMods, enabledMap);
      _addLog("metrics", "指标重算", {
        stageEfficiency: recomp.stageEfficiency,
        knowledgeGrowth: recomp.knowledgeGrowth,
        errorCount: recomp.errorCount
      });

      var totalEnabled = _countEnabledModules();
      var bloat = mt.moduleBloat(totalEnabled, MODULE_UPPER_LIMIT);
      var drift = mt.getDrift();

      // 3. Endure 门：若 evolutionDrift 或 moduleBloat>0.7 → 本代只做安全修正
      var endureOnly = drift.evolutionDrift || bloat > BLOAT_THRESHOLD;
      if (endureOnly) {
        _addLog("endure_gate", "Endure 门触发：仅做安全修正", {
          evolutionDrift: drift.evolutionDrift,
          moduleBloat: bloat,
          driftGenerations: drift.driftGenerations
        });
        _doSafetyCorrections(recomp.stageEfficiency);
        // 安全修正模式不做能力扩展
      } else {
        // 4. Excel 门：若 stageEfficiency 全部 ≥ 基线 → 允许范式演进建议
        var allAboveBaseline = true;
        for (var i = 0; i < recomp.stageEfficiency.length; i++) {
          if (recomp.stageEfficiency[i] < runtime.efficiencyBaseline) {
            allAboveBaseline = false;
            break;
          }
        }
        if (allAboveBaseline) {
          _addLog("excel_gate", "Excel 门通过：允许范式演进建议", {
            stageEfficiency: recomp.stageEfficiency,
            baseline: runtime.efficiencyBaseline
          });
          _suggestParadigmEvolution(recomp);
        }

        // 5. Evolve 门：跨阶段知识共享（成功 task_result 蒸馏到关联模块）
        _distillKnowledge(events);
      }

      // 6. 8 阶段遍历：更新各模块 usageCount/efficiency（已由 metrics.recompute 完成）
      st.generation = (st.generation || 0) + 1;
      st.lastDrainedTimestamp = runtime.lastCycleTimestamp;

      // 7. commitGeneration 计算 drift + 写进化日志 + 持久化 metrics 快照
      var committed = mt.commitGeneration(recomp.stageEfficiency, totalEnabled);
      st.metricsSnapshot = committed;

      _addLog("cycle_end", "第" + st.generation + "代完成", {
        generation: st.generation,
        evolutionDrift: committed.evolutionDrift,
        driftGenerations: committed.driftGenerations,
        moduleBloat: bloat,
        totalEnabled: totalEnabled,
        endureOnly: endureOnly
      });

      return {
        success: true,
        generation: st.generation,
        eventsProcessed: events.length,
        stageEfficiency: recomp.stageEfficiency,
        knowledgeGrowth: recomp.knowledgeGrowth,
        evolutionDrift: committed.evolutionDrift,
        moduleBloat: bloat,
        endureOnly: endureOnly
      };
    } catch (e) {
      lawViolation = true;
      _addLog("law_violation", "进化循环异常，回滚本代 metrics 快照", { error: String(e && e.message || e) });
      try { mt.loadSnapshot(preSnapshot); } catch (e2) { /* 回滚失败兜底 */ }
      return { success: false, reason: "exception", error: String(e && e.message || e) };
    }
  }

  // 安全修正：压缩低效模块权重（禁用效率最低的若干模块）
  function _doSafetyCorrections(stageEff) {
    var mm = runtime.moduleManager;
    if (!mm) return;
    // 找效率最低的阶段
    var minIdx = 0, minVal = stageEff[0];
    for (var i = 1; i < stageEff.length; i++) {
      if (stageEff[i] < minVal) { minVal = stageEff[i]; minIdx = i; }
    }
    var lowStage = EVOLUTION_STAGES[minIdx];
    _addLog("safety_correction", "压缩低效阶段模块权重", {
      stage: lowStage.name,
      efficiency: minVal
    });
    // 实际禁用该阶段效率最低的模块（由 moduleManager 执行）
    if (typeof mm.disableLowEfficiencyModule === "function") {
      mm.disableLowEfficiencyModule(lowStage.id, runtime.metrics);
    }
  }

  function _suggestParadigmEvolution(recomp) {
    // 范式演进建议（仅日志，不实际执行范式跃迁）
    _addLog("paradigm_suggestion", "建议评估范式跃迁：MOP→MOA→MAO→MASE", {
      stageEfficiency: recomp.stageEfficiency,
      knowledgeGrowth: recomp.knowledgeGrowth
    });
  }

  function _distillKnowledge(events) {
    // 成功 task_result 蒸馏：usageCount++（由 moduleManager 记录）
    var mm = runtime.moduleManager;
    if (!mm || typeof mm.incrementUsage !== "function") return;
    for (var i = 0; i < events.length; i++) {
      var p = events[i].payload;
      if (p.type === "task_result" && p.success && p.modulesUsed) {
        for (var j = 0; j < p.modulesUsed.length; j++) {
          try { mm.incrementUsage(p.modulesUsed[j]); } catch (e) { /* 忽略 */ }
        }
      }
    }
  }

  // ============ 工具函数（保留旧名）============

  function start_evolution() {
    var st = runtime.state;
    if (!st) return { success: false, reason: "not_initialized" };
    if (st.isRunning) return { success: true, alreadyRunning: true };
    st.isRunning = true;
    _scheduleNext();
    _addLog("system", "进化系统启动，模式：" + runtime.evolutionMode);
    return { success: true, mode: runtime.evolutionMode };
  }

  function stop_evolution() {
    var st = runtime.state;
    if (!st) return { success: false, reason: "not_initialized" };
    st.isRunning = false;
    if (runtime.timerId) {
      clearTimeout(runtime.timerId);
      runtime.timerId = null;
    }
    _addLog("system", "进化系统停止（当前代完成后停止）");
    return { success: true };
  }

  function trigger_evolution() {
    _addLog("system", "手动触发一代进化循环");
    return performEvolutionCycle();
  }

  function get_system_status() {
    var st = runtime.state;
    if (!st) return { error: "not_initialized" };
    var drift = runtime.metrics ? runtime.metrics.getDrift() : { evolutionDrift: false, driftGenerations: 0 };
    var totalEnabled = _countEnabledModules();
    var bloat = runtime.metrics ? runtime.metrics.moduleBloat(totalEnabled, MODULE_UPPER_LIMIT) : 0;
    return {
      isRunning: !!st.isRunning,
      generation: st.generation || 0,
      evolutionMode: runtime.evolutionMode,
      efficiencyBaseline: runtime.efficiencyBaseline,
      totalEnabledModules: totalEnabled,
      moduleUpperLimit: MODULE_UPPER_LIMIT,
      moduleBloat: bloat,
      evolutionDrift: drift.evolutionDrift,
      driftGenerations: drift.driftGenerations,
      knowledgeGrowth: runtime.metrics ? runtime.metrics.snapshot().knowledgeGrowth : 0,
      lastCycleTimestamp: runtime.lastCycleTimestamp
    };
  }

  function get_evolution_loop_info() {
    var mt = runtime.metrics;
    var trend = mt ? mt.getStageTrend() : [];
    return {
      stages: EVOLUTION_STAGES,
      currentStageEfficiency: (trend.length > 0 ? trend[trend.length - 1].stageEff : []),
      stageTrendHistory: trend,
      lastCycleTimestamp: runtime.lastCycleTimestamp,
      isRunning: !!(runtime.state && runtime.state.isRunning)
    };
  }

  function process_task(task) {
    // 兼容旧接口：接收任务描述，触发一次循环
    _addLog("task", "处理任务", { task: task });
    return trigger_evolution();
  }

  function get_generation_report() {
    var st = runtime.state;
    if (!st) return { error: "not_initialized" };
    var mt = runtime.metrics;
    var snap = mt ? mt.snapshot() : null;
    var totalEnabled = _countEnabledModules();
    return {
      generation: st.generation || 0,
      knowledgeGrowth: snap ? snap.knowledgeGrowth : 0,
      evolutionDrift: snap ? snap.evolutionDrift : false,
      driftGenerations: snap ? snap.driftGenerations : 0,
      moduleBloat: mt ? mt.moduleBloat(totalEnabled, MODULE_UPPER_LIMIT) : 0,
      stageEfficiencyHistory: snap ? snap.stageEfficiencyHistory : []
    };
  }

  function set_evolution_mode(args) {
    var mode = args && args.mode;
    if (!MODE_INTERVALS[mode]) return { success: false, reason: "invalid_mode" };
    var wasRunning = runtime.state && runtime.state.isRunning;
    runtime.evolutionMode = mode;
    if (wasRunning) {
      _scheduleNext();
    }
    _addLog("system", "进化模式切换为：" + mode);
    return { success: true, mode: mode };
  }

  function get_evolution_log(args) {
    var st = runtime.state;
    if (!st || !st.evolutionLog) return { logs: [] };
    var limit = (args && args.limit) || 50;
    return { logs: st.evolutionLog.slice(0, limit) };
  }

  function clear_evolution_log() {
    var st = runtime.state;
    if (!st) return { success: false };
    st.evolutionLog = [];
    return { success: true };
  }

  function toggle_auto_start(args) {
    runtime.autoStart = !!(args && args.enabled);
    return { success: true, autoStart: runtime.autoStart };
  }

  function _scheduleNext() {
    var st = runtime.state;
    if (!st || !st.isRunning) return;
    if (typeof setTimeout !== "function") {
      _addLog("system", "setTimeout 不可用，退化为手动触发模式");
      return;
    }
    if (runtime.timerId) clearTimeout(runtime.timerId);
    var interval = MODE_INTERVALS[runtime.evolutionMode] || MODE_INTERVALS.standard;
    runtime.timerId = setTimeout(function () {
      try {
        performEvolutionCycle();
      } catch (e) {
        _addLog("system", "定时循环异常：" + String(e && e.message || e));
      }
      _scheduleNext();
    }, interval);
  }

  function _reset() {
    if (runtime.timerId) { clearTimeout(runtime.timerId); runtime.timerId = null; }
    runtime.state = null;
    runtime.eventBus = null;
    runtime.metrics = null;
    runtime.moduleManager = null;
    runtime.lastCycleTimestamp = 0;
  }

  exports.EVOLUTION_STAGES = EVOLUTION_STAGES;
  exports.MODE_INTERVALS = MODE_INTERVALS;
  exports.MODULE_UPPER_LIMIT = MODULE_UPPER_LIMIT;
  exports.BLOAT_THRESHOLD = BLOAT_THRESHOLD;
  exports._setRuntime = _setRuntime;
  exports._reset = _reset;
  exports.performEvolutionCycle = performEvolutionCycle;
  // 工具函数（旧名保留）
  exports.start_evolution = start_evolution;
  exports.stop_evolution = stop_evolution;
  exports.trigger_evolution = trigger_evolution;
  exports.get_system_status = get_system_status;
  exports.get_evolution_loop_info = get_evolution_loop_info;
  exports.process_task = process_task;
  exports.get_generation_report = get_generation_report;
  exports.set_evolution_mode = set_evolution_mode;
  exports.get_evolution_log = get_evolution_log;
  exports.clear_evolution_log = clear_evolution_log;
  exports.toggle_auto_start = toggle_auto_start;
})();
