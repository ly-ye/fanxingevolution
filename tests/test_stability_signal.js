/*
 * 测试 - stability_signal
 * 创作者：夜
 */

require("./mock_toolpkg");
var assert = require("assert");
var stability = require("stability_signal");
var metrics = require("metrics");
var mm = require("module_manager");

function test(name, fn) {
  try {
    stability._reset();
    metrics._reset();
    mm._reset();
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  }
}

var TEST_DATA = {
  stages: [{ id: "perception", name: "感知", order: 1 }],
  modules: [
    { id: "context_awareness", name: "上下文感知", filename: "c.md", category: "perception", index: 1, stage: "perception", description: "x" },
    { id: "nlu_engine", name: "NLU", filename: "n.md", category: "perception", index: 2, stage: "perception", description: "y" }
  ]
};

function setup() {
  mm._injectModulesData(TEST_DATA);
  mm._setRuntime({ state: { modules: {}, customModules: [], skillMappings: {}, moduleUsage: {} } });
  stability._setRuntime({ metrics: metrics, moduleManager: mm });
}

console.log("test_stability_signal.js");

test("get_stability_signal 返回完整结构", function () {
  setup();
  var s = stability.get_stability_signal();
  assert.ok(typeof s.evolutionDrift === "boolean");
  assert.ok(typeof s.moduleBloat === "number");
  assert.ok(Array.isArray(s.efficiencyTrend));
  assert.ok(typeof s.driftGenerations === "number");
});

test("evolutionDrift 初始为 false", function () {
  setup();
  var s = stability.get_stability_signal();
  assert.strictEqual(s.evolutionDrift, false);
  assert.strictEqual(s.driftGenerations, 0);
});

test("moduleBloat 反映启用比例", function () {
  setup();
  // 2 个模块默认全启用 → bloat = 2/48
  var s = stability.get_stability_signal();
  assert.ok(s.moduleBloat > 0);
  assert.ok(s.moduleBloat < 1);
  // 禁用一个
  mm.disable_module({ module_id: "nlu_engine" });
  s = stability.get_stability_signal();
  // 1/48
  assert.ok(s.moduleBloat > 0 && s.moduleBloat < 0.1);
});

test("drift 触发后信号反映", function () {
  setup();
  // 制造 drift
  metrics.commitGeneration([100, 100, 100, 100, 100, 100, 100, 100], 2);
  metrics.commitGeneration([95, 95, 95, 95, 95, 95, 95, 95], 2);
  metrics.commitGeneration([90, 90, 90, 90, 90, 90, 90, 90], 2);
  metrics.commitGeneration([85, 85, 85, 85, 85, 85, 85, 85], 2);
  var s = stability.get_stability_signal();
  assert.strictEqual(s.evolutionDrift, true);
  assert.ok(s.driftGenerations >= 1);
});

test("get_evolution_drift 仅返回布尔", function () {
  setup();
  var r = stability.get_evolution_drift();
  assert.ok(typeof r.evolutionDrift === "boolean");
});

test("metrics 为 null 时返回安全默认值", function () {
  stability._reset();
  stability._setRuntime({ metrics: null, moduleManager: null });
  var s = stability.get_stability_signal();
  assert.strictEqual(s.evolutionDrift, false);
  assert.strictEqual(s.moduleBloat, 0);
  assert.deepStrictEqual(s.efficiencyTrend, []);
});

console.log("");
