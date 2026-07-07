/*
 * 测试 - evolution_core
 * 创作者：夜
 */

require("./mock_toolpkg");
var assert = require("assert");
var evolution = require("evolution_core");
var eventBus = require("event_bus");
var metrics = require("metrics");

function test(name, fn) {
  try {
    evolution._reset();
    eventBus._reset();
    metrics._reset();
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  }
}

// 简易 moduleManager mock
function makeMockModuleManager(modules) {
  var mods = modules || [
    { id: "context_awareness", stage: "perception", enabled: true },
    { id: "nlu_engine", stage: "perception", enabled: true },
    { id: "memory", stage: "memory", enabled: true },
    { id: "knowledge_graph", stage: "memory", enabled: true },
    { id: "metacognition", stage: "thinking", enabled: true },
    { id: "goal_planning", stage: "action", enabled: true },
    { id: "reflection", stage: "reflection", enabled: true },
    { id: "self_improver", stage: "evolution", enabled: true },
    { id: "cache_manager", stage: "infrastructure", enabled: true },
    { id: "permission_control", stage: "security", enabled: true }
  ];
  var usage = {};
  var disabledLow = [];
  return {
    list_modules: function () { return { modules: mods.map(function (m) { return Object.assign({}, m); }) }; },
    getModulesByStage: function (stage) { return mods.filter(function (m) { return m.stage === stage; }); },
    incrementUsage: function (mid) { usage[mid] = (usage[mid] || 0) + 1; },
    getUsage: function () { return usage; },
    disableLowEfficiencyModule: function (stage, mt) { disabledLow.push(stage); },
    getDisabledLowLog: function () { return disabledLow; }
  };
}

function setupRuntime(opts) {
  opts = opts || {};
  var state = opts.state || { generation: 0, evolutionLog: [], lastDrainedTimestamp: 0, isRunning: false };
  var mm = opts.moduleManager || makeMockModuleManager();
  evolution._setRuntime({
    state: state,
    eventBus: eventBus,
    metrics: metrics,
    moduleManager: mm,
    efficiencyBaseline: opts.efficiencyBaseline || 70
  });
  return { state: state, mm: mm };
}

function mkTaskEvent(success, modules, complexity) {
  return { type: "task_result", success: success, modulesUsed: modules, durationMs: 100, complexity: complexity };
}

console.log("test_evolution_core.js");

test("performEvolutionCycle 消化事件并推进代数", function () {
  var ctx = setupRuntime();
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  var r = evolution.performEvolutionCycle();
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.generation, 1);
  assert.strictEqual(r.eventsProcessed, 1);
  assert.strictEqual(ctx.state.generation, 1);
});

test("日志含阶段流/活跃模块/真实指标", function () {
  var ctx = setupRuntime();
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.7));
  evolution.performEvolutionCycle();
  var logResult = evolution.get_evolution_log({ limit: 100 });
  var types = logResult.logs.map(function (l) { return l.type; });
  assert.ok(types.indexOf("cycle_start") >= 0, "缺 cycle_start");
  assert.ok(types.indexOf("metrics") >= 0, "缺 metrics");
  assert.ok(types.indexOf("cycle_end") >= 0, "缺 cycle_end");
  var metricsLog = logResult.logs.find(function (l) { return l.type === "metrics"; });
  assert.ok(metricsLog.data.stageEfficiency, "metrics log 缺 stageEfficiency");
  assert.ok(typeof metricsLog.data.knowledgeGrowth === "number");
});

test("真实指标来自事件而非随机", function () {
  var ctx = setupRuntime();
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  var r1 = evolution.performEvolutionCycle();
  var kg1 = r1.knowledgeGrowth;
  assert.ok(kg1 > 0, "knowledgeGrowth 应>0");
  // 再喂一个成功事件
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  var r2 = evolution.performEvolutionCycle();
  assert.ok(r2.knowledgeGrowth > kg1, "knowledgeGrowth 应递增");
});

test("Endure 门在 drift 时只做安全修正", function () {
  var ctx = setupRuntime();
  // 制造连续3代下降触发 drift
  // 代1
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  evolution.performEvolutionCycle();
  // 代2-4：手动 commitGeneration 制造下降（模拟效率下降）
  metrics.commitGeneration([95, 95, 95, 95, 95, 95, 95, 95], 10);
  metrics.commitGeneration([90, 90, 90, 90, 90, 90, 90, 90], 10);
  metrics.commitGeneration([85, 85, 85, 85, 85, 85, 85, 85], 10);
  // 现在 drift 应为 true
  assert.strictEqual(metrics.getDrift().evolutionDrift, true);

  // 再跑一代循环，应触发 Endure 门
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  var r = evolution.performEvolutionCycle();
  assert.strictEqual(r.endureOnly, true, "应触发 Endure 门");

  var logResult = evolution.get_evolution_log({ limit: 100 });
  var endureLog = logResult.logs.find(function (l) { return l.type === "endure_gate"; });
  assert.ok(endureLog, "应有 endure_gate 日志");
  // 应调用 disableLowEfficiencyModule
  assert.ok(ctx.mm.getDisabledLowLog().length > 0, "应执行安全修正");
});

test("moduleBloat>0.7 触发 Endure 门", function () {
  // 35+ 模块启用 → bloat > 0.7
  var mods = [];
  for (var i = 0; i < 40; i++) mods.push({ id: "mod_" + i, stage: "perception", enabled: true });
  var ctx = setupRuntime({ moduleManager: makeMockModuleManager(mods) });
  eventBus.submit(mkTaskEvent(true, ["mod_0"], 0.5));
  var r = evolution.performEvolutionCycle();
  assert.strictEqual(r.endureOnly, true, "bloat>0.7 应触发 Endure");
  assert.ok(r.moduleBloat > 0.7);
});

test("set_evolution_mode 校验非法模式", function () {
  setupRuntime();
  var r = evolution.set_evolution_mode({ mode: "invalid" });
  assert.strictEqual(r.success, false);
  var r2 = evolution.set_evolution_mode({ mode: "deep" });
  assert.strictEqual(r2.success, true);
});

test("trigger_evolution 手动触发", function () {
  setupRuntime();
  var r = evolution.trigger_evolution();
  assert.strictEqual(r.success, true);
});

test("get_system_status 返回完整状态", function () {
  setupRuntime();
  evolution.performEvolutionCycle();
  var s = evolution.get_system_status();
  assert.ok(typeof s.generation === "number");
  assert.ok(typeof s.isRunning === "boolean");
  assert.ok(typeof s.moduleBloat === "number");
  assert.ok(typeof s.evolutionDrift === "boolean");
  assert.strictEqual(s.moduleUpperLimit, 48);
});

test("get_generation_report 返回当代报告", function () {
  setupRuntime();
  eventBus.submit(mkTaskEvent(true, ["memory"], 0.5));
  evolution.performEvolutionCycle();
  var rep = evolution.get_generation_report();
  assert.ok(rep.generation >= 1);
  assert.ok(typeof rep.knowledgeGrowth === "number");
});

test("clear_evolution_log 清空日志", function () {
  setupRuntime();
  evolution.performEvolutionCycle();
  var r = evolution.clear_evolution_log();
  assert.strictEqual(r.success, true);
  assert.strictEqual(evolution.get_evolution_log().logs.length, 0);
});

console.log("");
