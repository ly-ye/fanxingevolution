/*
 * 测试 - metrics
 * 创作者：夜
 */

require("./mock_toolpkg"); // 注册 require shim
var assert = require("assert");
var metrics = require("metrics");

function test(name, fn) {
  try {
    metrics._reset();
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  }
}

var STAGES = [
  { id: "perception", modules: ["context_awareness", "nlu_engine"] },
  { id: "memory", modules: ["memory", "knowledge_graph"] },
  { id: "thinking", modules: ["metacognition"] },
  { id: "action", modules: ["goal_planning"] },
  { id: "reflection", modules: ["reflection"] },
  { id: "evolution", modules: ["self_improver"] },
  { id: "infrastructure", modules: ["cache_manager"] },
  { id: "security", modules: ["permission_control"] }
];

var MODS_ENABLED = {
  context_awareness: true, nlu_engine: true,
  memory: true, knowledge_graph: true,
  metacognition: true, goal_planning: true,
  reflection: true, self_improver: true,
  cache_manager: true, permission_control: true
};

function mkTaskEvent(success, modules, complexity) {
  return { timestamp: Date.now(), type: "task_result", payload: { type: "task_result", success: success, modulesUsed: modules, durationMs: 100, complexity: complexity } };
}

console.log("test_metrics.js");

test("task_result 成功提升模块效率", function () {
  var events = [
    mkTaskEvent(true, ["memory"], 0.5),
    mkTaskEvent(true, ["memory"], 0.5)
  ];
  var r = metrics.recompute(events, STAGES, MODS_ENABLED);
  var memEff = metrics.getModuleEfficiency("memory");
  assert.ok(memEff > 100, "memory eff 应 >100, got " + memEff);
});

test("task_result 失败降低模块效率", function () {
  var events = [mkTaskEvent(false, ["memory"], 0.5)];
  metrics.recompute(events, STAGES, MODS_ENABLED);
  var memEff = metrics.getModuleEfficiency("memory");
  assert.ok(memEff < 100, "memory eff 应 <100, got " + memEff);
});

test("knowledgeGrowth 累加成功任务复杂度", function () {
  var events = [
    mkTaskEvent(true, ["memory"], 0.6),
    mkTaskEvent(true, ["memory"], 0.4)
  ];
  var r = metrics.recompute(events, STAGES, MODS_ENABLED);
  assert.ok(r.knowledgeGrowth >= 0.9, "knowledgeGrowth 应≈1.0, got " + r.knowledgeGrowth);
});

test("error_path 扣减 knowledgeGrowth", function () {
  var events = [
    mkTaskEvent(true, ["memory"], 0.5),
    { timestamp: Date.now(), payload: { type: "error_path", errorType: "tool_fail", moduleId: "memory", recovered: false } }
  ];
  var r = metrics.recompute(events, STAGES, MODS_ENABLED);
  // 0.5 - 0.1 = 0.4
  assert.ok(Math.abs(r.knowledgeGrowth - 0.4) < 0.01, "knowledgeGrowth 应≈0.4, got " + r.knowledgeGrowth);
});

test("stageEfficiency 是阶段活跃模块效率均值", function () {
  var events = [
    mkTaskEvent(true, ["context_awareness"], 0.5),
    mkTaskEvent(false, ["nlu_engine"], 0.5)
  ];
  var r = metrics.recompute(events, STAGES, MODS_ENABLED);
  var stage0 = r.stageEfficiency[0]; // perception
  assert.ok(stage0 > 0, "stageEfficiency[0] 应 >0, got " + stage0);
});

test("连续3代下降触发 evolutionDrift", function () {
  // 代1：基线效率
  metrics.recompute([mkTaskEvent(true, ["memory"], 0.5)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([100, 100, 100, 100, 100, 100, 100, 100], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, false);

  // 代2：下降
  metrics.recompute([mkTaskEvent(false, ["memory"], 0.5)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([95, 95, 95, 95, 95, 95, 95, 95], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, false);

  // 代3：再下降
  metrics.recompute([mkTaskEvent(false, ["memory"], 0.5)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([90, 90, 90, 90, 90, 90, 90, 90], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, false);

  // 代4：再下降 → 连续3代下降
  metrics.recompute([mkTaskEvent(false, ["memory"], 0.5)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([85, 85, 85, 85, 85, 85, 85, 85], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, true);
  assert.ok(metrics.getDrift().driftGenerations >= 1);
});

test("knowledgeGrowth 环比为负触发 drift", function () {
  // 代1: knowledgeGrowth=2
  metrics.recompute([mkTaskEvent(true, ["memory"], 1.0), mkTaskEvent(true, ["memory"], 1.0)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([100, 100, 100, 100, 100, 100, 100, 100], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, false);

  // 代2: knowledgeGrowth 下降（不喂成功事件，只喂 error_path 使 knowledgeGrowth 减少）
  metrics.recompute([{ timestamp: Date.now(), payload: { type: "error_path", errorType: "x" } }], STAGES, MODS_ENABLED);
  // knowledgeGrowth 从 2 → 2 - 0.1 = 1.9（仍下降）
  metrics.commitGeneration([100, 100, 100, 100, 100, 100, 100, 100], 10);
  assert.strictEqual(metrics.getDrift().evolutionDrift, true);
});

test("moduleBloat 计算", function () {
  var bloat = metrics.moduleBloat(24, 48);
  assert.ok(Math.abs(bloat - 0.5) < 0.01);
  var bloat2 = metrics.moduleBloat(48, 48);
  assert.ok(Math.abs(bloat2 - 1.0) < 0.01);
});

test("snapshot 与 loadSnapshot 往返", function () {
  metrics.recompute([mkTaskEvent(true, ["memory"], 0.5)], STAGES, MODS_ENABLED);
  metrics.commitGeneration([100, 100, 100, 100, 100, 100, 100, 100], 10);
  var snap = metrics.snapshot();

  metrics._reset();
  assert.strictEqual(metrics.snapshot().generation, 0);

  metrics.loadSnapshot(snap);
  var snap2 = metrics.snapshot();
  assert.strictEqual(snap2.generation, snap.generation);
  assert.strictEqual(snap2.knowledgeGrowth, snap.knowledgeGrowth);
});

console.log("");
