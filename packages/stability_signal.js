/*
 * 繁星·自进化内核 - 稳定性信号
 * 薄封装 metrics 输出，暴露给繁星 Arbiter（只读）
 * 创作者：夜
 */

(function () {
  "use strict";

  var runtime = {
    metrics: null,
    moduleManager: null,
    moduleUpperLimit: 48
  };

  function _setRuntime(opts) {
    runtime.metrics = opts.metrics || runtime.metrics;
    runtime.moduleManager = opts.moduleManager || runtime.moduleManager;
    if (opts.moduleUpperLimit) runtime.moduleUpperLimit = opts.moduleUpperLimit;
  }

  function _countEnabledModules() {
    var mm = runtime.moduleManager;
    if (!mm || typeof mm.list_modules !== "function") return 0;
    var all = mm.list_modules({ category: "all" });
    if (!all || !all.modules) return 0;
    var c = 0;
    for (var i = 0; i < all.modules.length; i++) {
      if (all.modules[i].enabled) c++;
    }
    return c;
  }

  function _getEfficiencyTrend() {
    var mt = runtime.metrics;
    if (!mt) return [];
    var trend = mt.getStageTrend();
    if (trend.length === 0) return [];
    var last = trend[trend.length - 1];
    return last.stageEff || [];
  }

  /**
   * 返回完整稳定性信号（供繁星 Arbiter 计算 S 函数）
   */
  function getStabilitySignal() {
    var mt = runtime.metrics;
    if (!mt) {
      return {
        evolutionDrift: false,
        moduleBloat: 0,
        efficiencyTrend: [],
        driftGenerations: 0
      };
    }
    var drift = mt.getDrift();
    var totalEnabled = _countEnabledModules();
    var bloat = mt.moduleBloat(totalEnabled, runtime.moduleUpperLimit);
    var trend = _getEfficiencyTrend();
    return {
      evolutionDrift: drift.evolutionDrift,
      moduleBloat: bloat,
      efficiencyTrend: trend,
      driftGenerations: drift.driftGenerations
    };
  }

  /**
   * 仅返回 evolutionDrift（角色卡 S 函数 λ5 变量源）
   */
  function getEvolutionDrift() {
    var mt = runtime.metrics;
    if (!mt) return false;
    return mt.getDrift().evolutionDrift;
  }

  // 工具函数
  function get_stability_signal() {
    return getStabilitySignal();
  }

  function get_evolution_drift() {
    return { evolutionDrift: getEvolutionDrift() };
  }

  function _reset() {
    runtime.metrics = null;
    runtime.moduleManager = null;
  }

  exports._setRuntime = _setRuntime;
  exports._reset = _reset;
  exports.getStabilitySignal = getStabilitySignal;
  exports.getEvolutionDrift = getEvolutionDrift;
  // 工具函数
  exports.get_stability_signal = get_stability_signal;
  exports.get_evolution_drift = get_evolution_drift;
})();
