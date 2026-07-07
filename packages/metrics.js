/*
 * 繁星·自进化内核 - 指标计算
 * 从事件流计算真实的 efficiency/knowledgeGrowth/evolutionDrift
 * 创作者：夜
 */

(function () {
  "use strict";

  var MODULE_EFFICIENCY_MIN = 0;
  var MODULE_EFFICIENCY_MAX = 150;
  var EFFICIENCY_WINDOW = 20; // 近 20 次 task_result 衰减窗口
  var SUCCESS_DELTA = 0.5;
  var FAILURE_DELTA = -1.0;
  var ERROR_PATH_PENALTY = 0.1;
  var DRIFT_GENERATIONS = 3; // 连续 N 代下降触发漂移

  var state = {
    moduleEfficiency: {},      // mid -> 当前效率值 (0~150)
    moduleHistory: {},         // mid -> [success bool 数组] 近 N 次
    stageEfficiencyHistory: [], // [{gen, stageEff[8]}] 每代快照
    knowledgeGrowth: 0,
    knowledgeGrowthHistory: [], // 每代 knowledgeGrowth 快照
    generation: 0,
    evolutionDrift: false,
    driftGenerations: 0
  };

  function _ensureModule(mid) {
    if (!state.moduleEfficiency[mid]) state.moduleEfficiency[mid] = 100;
    if (!state.moduleHistory[mid]) state.moduleHistory[mid] = [];
  }

  function _pushHistory(mid, success) {
    var h = state.moduleHistory[mid];
    h.push(success);
    if (h.length > EFFICIENCY_WINDOW) h.shift();
  }

  function _recomputeModuleEfficiency(mid) {
    var h = state.moduleHistory[mid];
    if (!h || h.length === 0) return state.moduleEfficiency[mid] || 100;
    var delta = 0;
    for (var i = 0; i < h.length; i++) {
      delta += h[i] ? SUCCESS_DELTA : FAILURE_DELTA;
    }
    var base = 100;
    var newEff = base + delta;
    return Math.max(MODULE_EFFICIENCY_MIN, Math.min(MODULE_EFFICIENCY_MAX, newEff));
  }

  function _stageEfficiencyFromModules(stageModules, modulesEnabled) {
    var sum = 0, cnt = 0;
    for (var i = 0; i < stageModules.length; i++) {
      var mid = stageModules[i];
      if (modulesEnabled && !modulesEnabled[mid]) continue;
      _ensureModule(mid);
      sum += state.moduleEfficiency[mid];
      cnt++;
    }
    return cnt > 0 ? sum / cnt : 0;
  }

  /**
   * 重新计算指标
   * @param {Array} events 自上次循环以来的新事件（event_bus.drain 结果）
   * @param {Object} stages 8 阶段定义 [{id,name,modules[]}]
   * @param {Object} modulesEnabled {mid:bool}
   * @returns {Object} 计算后的指标快照
   */
  function recompute(events, stages, modulesEnabled) {
    events = events || [];
    stages = stages || [];
    modulesEnabled = modulesEnabled || {};

    var errorCount = 0;

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var p = e.payload;

      if (p.type === "task_result") {
        var mods = p.modulesUsed || [];
        for (var j = 0; j < mods.length; j++) {
          var mid = mods[j];
          _ensureModule(mid);
          _pushHistory(mid, p.success);
          state.moduleEfficiency[mid] = _recomputeModuleEfficiency(mid);
        }
        if (p.success) {
          var c = typeof p.complexity === "number" ? p.complexity : 0.5;
          state.knowledgeGrowth += Math.max(0, Math.min(1, c));
        }
      } else if (p.type === "skill_update") {
        if (p.moduleId) {
          _ensureModule(p.moduleId);
          // skill_update 的 success/failure 也影响模块效率
          if (typeof p.success === "number" && p.success > 0) {
            _pushHistory(p.moduleId, true);
          } else if (typeof p.failure === "number" && p.failure > 0) {
            _pushHistory(p.moduleId, false);
          }
          state.moduleEfficiency[p.moduleId] = _recomputeModuleEfficiency(p.moduleId);
        }
      } else if (p.type === "error_path") {
        errorCount++;
        if (p.moduleId) {
          _ensureModule(p.moduleId);
          _pushHistory(p.moduleId, false);
          state.moduleEfficiency[p.moduleId] = _recomputeModuleEfficiency(p.moduleId);
        }
      }
      // module_toggle 不影响指标，仅状态变更
    }

    // 错误路径扣减知识增长
    state.knowledgeGrowth = Math.max(0, state.knowledgeGrowth - errorCount * ERROR_PATH_PENALTY);

    // 计算当前 8 阶段效率
    var currentStageEff = [];
    for (var s = 0; s < stages.length; s++) {
      currentStageEff.push(_stageEfficiencyFromModules(stages[s].modules, modulesEnabled));
    }

    return {
      stageEfficiency: currentStageEff,
      knowledgeGrowth: state.knowledgeGrowth,
      errorCount: errorCount
    };
  }

  /**
   * 代结束快照（evolution_core 在每代结束时调用）
   * 计算 evolutionDrift
   */
  function commitGeneration(stageEfficiency, totalEnabledModules) {
    state.generation++;
    state.stageEfficiencyHistory.push({
      gen: state.generation,
      stageEff: stageEfficiency.slice()
    });
    if (state.stageEfficiencyHistory.length > DRIFT_GENERATIONS + 1) {
      state.stageEfficiencyHistory.shift();
    }
    state.knowledgeGrowthHistory.push(state.knowledgeGrowth);
    if (state.knowledgeGrowthHistory.length > DRIFT_GENERATIONS + 1) {
      state.knowledgeGrowthHistory.shift();
    }

    _detectDrift(totalEnabledModules);
    return snapshot();
  }

  function _detectDrift(totalEnabledModules) {
    var hist = state.stageEfficiencyHistory;
    var driftDetected = false;

    // 检测连续 N 代 stageEfficiency 下降（用 8 阶段均值）
    if (hist.length >= DRIFT_GENERATIONS + 1) {
      var recent = hist.slice(-(DRIFT_GENERATIONS + 1));
      var allDeclining = true;
      for (var i = 1; i < recent.length; i++) {
        var prevAvg = _avg(recent[i - 1].stageEff);
        var currAvg = _avg(recent[i].stageEff);
        if (currAvg >= prevAvg) {
          allDeclining = false;
          break;
        }
      }
      if (allDeclining) driftDetected = true;
    }

    // 检测 knowledgeGrowth 环比为负
    if (!driftDetected && state.knowledgeGrowthHistory.length >= 2) {
      var k = state.knowledgeGrowthHistory;
      var prevK = k[k.length - 2];
      var currK = k[k.length - 1];
      if (currK < prevK) {
        driftDetected = true;
      }
    }

    if (driftDetected) {
      state.evolutionDrift = true;
      state.driftGenerations++;
    } else {
      state.evolutionDrift = false;
      state.driftGenerations = 0;
    }
  }

  function _avg(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function getModuleEfficiency(mid) {
    _ensureModule(mid);
    return state.moduleEfficiency[mid];
  }

  function getDrift() {
    return {
      evolutionDrift: state.evolutionDrift,
      driftGenerations: state.driftGenerations
    };
  }

  function getStageTrend() {
    return state.stageEfficiencyHistory.slice();
  }

  function moduleBloat(totalEnabledModules, moduleUpperLimit) {
    var limit = moduleUpperLimit || 48;
    return Math.max(0, Math.min(1, totalEnabledModules / limit));
  }

  function snapshot() {
    return {
      generation: state.generation,
      moduleEfficiency: Object.assign({}, state.moduleEfficiency),
      stageEfficiencyHistory: state.stageEfficiencyHistory.slice(),
      knowledgeGrowth: state.knowledgeGrowth,
      knowledgeGrowthHistory: state.knowledgeGrowthHistory.slice(),
      evolutionDrift: state.evolutionDrift,
      driftGenerations: state.driftGenerations
    };
  }

  function loadSnapshot(data) {
    if (!data) return;
    state.generation = data.generation || 0;
    state.moduleEfficiency = data.moduleEfficiency || {};
    state.moduleHistory = {}; // 历史窗口不持久化，重启后从空开始
    state.stageEfficiencyHistory = data.stageEfficiencyHistory || [];
    state.knowledgeGrowth = data.knowledgeGrowth || 0;
    state.knowledgeGrowthHistory = data.knowledgeGrowthHistory || [];
    state.evolutionDrift = data.evolutionDrift || false;
    state.driftGenerations = data.driftGenerations || 0;
  }

  function _reset(stages) {
    state = {
      moduleEfficiency: {},
      moduleHistory: {},
      stageEfficiencyHistory: [],
      knowledgeGrowth: 0,
      knowledgeGrowthHistory: [],
      generation: 0,
      evolutionDrift: false,
      driftGenerations: 0
    };
  }

  exports.recompute = recompute;
  exports.commitGeneration = commitGeneration;
  exports.getModuleEfficiency = getModuleEfficiency;
  exports.getDrift = getDrift;
  exports.getStageTrend = getStageTrend;
  exports.moduleBloat = moduleBloat;
  exports.snapshot = snapshot;
  exports.loadSnapshot = loadSnapshot;
  exports._reset = _reset;
  exports.DRIFT_GENERATIONS = DRIFT_GENERATIONS;
})();
