/*
 * 测试 - module_manager
 * 创作者：夜
 */

require("./mock_toolpkg");
var assert = require("assert");
var mm = require("module_manager");

function test(name, fn) {
  try {
    mm._reset();
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  }
}

// 注入测试模块数据（避免读文件）
var TEST_DATA = {
  stages: [
    { id: "perception", name: "感知", order: 1, module_count: 2 },
    { id: "memory", name: "记忆", order: 2, module_count: 1 },
    { id: "thinking", name: "思考", order: 3, module_count: 1 },
    { id: "action", name: "行动", order: 4, module_count: 1 },
    { id: "reflection", name: "反思", order: 5, module_count: 1 },
    { id: "evolution", name: "进化", order: 6, module_count: 1 },
    { id: "infrastructure", name: "基础设施", order: 7, module_count: 1 },
    { id: "security", name: "安全扩展", order: 8, module_count: 1 }
  ],
  modules: [
    { id: "context_awareness", name: "上下文感知", filename: "context_awareness.md", category: "perception", index: 1, stage: "perception", description: "上下文感知" },
    { id: "nlu_engine", name: "自然语言理解", filename: "nlu_engine.md", category: "perception", index: 2, stage: "perception", description: "NLU" },
    { id: "memory", name: "记忆系统", filename: "memory.md", category: "memory", index: 6, stage: "memory", description: "记忆" },
    { id: "metacognition", name: "元认知", filename: "metacognition.md", category: "thinking", index: 9, stage: "thinking", description: "元认知" },
    { id: "goal_planning", name: "目标规划", filename: "goal_planning.md", category: "action", index: 17, stage: "action", description: "目标规划" },
    { id: "reflection", name: "反思循环", filename: "reflection.md", category: "reflection", index: 26, stage: "reflection", description: "反思" },
    { id: "self_improver", name: "代码自改进", filename: "self_improver.md", category: "evolution", index: 31, stage: "evolution", description: "自改进" },
    { id: "cache_manager", name: "缓存管理", filename: "cache_manager.md", category: "infrastructure", index: 38, stage: "infrastructure", description: "缓存" },
    { id: "permission_control", name: "权限控制", filename: "permission_control.md", category: "security", index: 46, stage: "security", description: "权限" }
  ]
};

function setup() {
  mm._injectModulesData(TEST_DATA);
  mm._setRuntime({ state: { modules: {}, customModules: [], skillMappings: {}, moduleUsage: {} } });
}

console.log("test_module_manager.js");

test("list_modules all 返回全部模块", function () {
  setup();
  var r = mm.list_modules({ category: "all" });
  assert.strictEqual(r.total, 9);
  assert.ok(r.modules.length === 9);
  assert.ok(r.categories.perception);
});

test("list_modules 按分类过滤", function () {
  setup();
  var r = mm.list_modules({ category: "perception" });
  assert.strictEqual(r.total, 2);
  r.modules.forEach(function (m) { assert.strictEqual(m.category, "perception"); });
});

test("模块默认启用", function () {
  setup();
  var r = mm.list_modules({ category: "all" });
  r.modules.forEach(function (m) {
    assert.strictEqual(m.enabled, true, m.id + " 应默认启用");
  });
});

test("enable/disable 模块", function () {
  setup();
  mm.disable_module({ module_id: "memory" });
  assert.strictEqual(mm.get_module_info({ module_id: "memory" }).enabled, false);
  mm.enable_module({ module_id: "memory" });
  assert.strictEqual(mm.get_module_info({ module_id: "memory" }).enabled, true);
});

test("disable 不存在的模块返回 not_found", function () {
  setup();
  var r = mm.disable_module({ module_id: "nonexistent" });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "module_not_found");
});

test("enable_category 批量启用", function () {
  setup();
  mm.disable_all_modules();
  var r = mm.enable_category({ category: "perception" });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.enabledCount, 2);
  var mods = mm.list_modules({ category: "perception" });
  mods.modules.forEach(function (m) { assert.strictEqual(m.enabled, true); });
});

test("disable_category 批量禁用", function () {
  setup();
  var r = mm.disable_category({ category: "perception" });
  assert.strictEqual(r.success, true);
  var mods = mm.list_modules({ category: "perception" });
  mods.modules.forEach(function (m) { assert.strictEqual(m.enabled, false); });
});

test("enable_all / disable_all", function () {
  setup();
  mm.disable_all_modules();
  var all = mm.list_modules({ category: "all" });
  all.modules.forEach(function (m) { assert.strictEqual(m.enabled, false); });
  mm.enable_all_modules();
  all = mm.list_modules({ category: "all" });
  all.modules.forEach(function (m) { assert.strictEqual(m.enabled, true); });
});

test("自定义模块增删", function () {
  setup();
  var add = mm.add_custom_module({ name: "我的模块", description: "测试" });
  assert.strictEqual(add.success, true);
  var custId = add.module.id;
  assert.ok(custId.indexOf("custom_") === 0);

  var list = mm.list_modules({ category: "custom" });
  assert.strictEqual(list.total, 1);

  var rm = mm.remove_custom_module({ module_id: custId });
  assert.strictEqual(rm.success, true);
  assert.strictEqual(mm.list_modules({ category: "custom" }).total, 0);
});

test("getModulesByStage 按阶段返回", function () {
  setup();
  var mods = mm.getModulesByStage("perception");
  assert.strictEqual(mods.length, 2);
  assert.ok(mods[0].id === "context_awareness" || mods[0].id === "nlu_engine");
});

test("incrementUsage 累计使用次数", function () {
  setup();
  mm.incrementUsage("memory");
  mm.incrementUsage("memory");
  var info = mm.get_module_info({ module_id: "memory" });
  assert.strictEqual(info.usageCount, 2);
});

// ============ Skill 映射 ============

test("map_skill_module 注册映射", function () {
  setup();
  var r = mm.map_skill_module({ skillId: "data_analysis", moduleId: "memory", exclusive: true });
  assert.strictEqual(r.success, true);
  var m = mm.get_skill_mapping({ skillId: "data_analysis" }).mapping;
  assert.ok(m);
  assert.strictEqual(m.moduleId, "memory");
  assert.strictEqual(m.exclusive, true);
});

test("map_skill_module 模块不存在拒绝", function () {
  setup();
  var r = mm.map_skill_module({ skillId: "s1", moduleId: "nonexistent" });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "module_not_found");
});

test("unmap_skill_module 解除映射", function () {
  setup();
  mm.map_skill_module({ skillId: "s1", moduleId: "memory" });
  var r = mm.unmap_skill_module({ skillId: "s1" });
  assert.strictEqual(r.success, true);
  assert.strictEqual(mm.get_skill_mapping({ skillId: "s1" }).mapping, null);
});

test("get_skill_mapping 按 moduleId 查询依赖", function () {
  setup();
  mm.map_skill_module({ skillId: "s1", moduleId: "memory" });
  mm.map_skill_module({ skillId: "s2", moduleId: "memory" });
  var r = mm.get_skill_mapping({ moduleId: "memory" });
  assert.strictEqual(r.mappings.length, 2);
});

test("safe_disable_module 无依赖时正常禁用", function () {
  setup();
  var r = mm.safe_disable_module({ module_id: "memory" });
  assert.strictEqual(r.success, true);
  assert.strictEqual(mm.get_module_info({ module_id: "memory" }).enabled, false);
});

test("safe_disable_module 有独占依赖时拒绝", function () {
  setup();
  mm.map_skill_module({ skillId: "s1", moduleId: "memory", exclusive: true });
  var r = mm.safe_disable_module({ module_id: "memory" });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "skill_dependent");
  assert.ok(r.dependents.indexOf("s1") >= 0);
  // 模块仍启用
  assert.strictEqual(mm.get_module_info({ module_id: "memory" }).enabled, true);
});

test("safe_disable_module 非独占依赖不拒绝", function () {
  setup();
  mm.map_skill_module({ skillId: "s1", moduleId: "memory", exclusive: false });
  var r = mm.safe_disable_module({ module_id: "memory" });
  assert.strictEqual(r.success, true);
});

test("disableLowEfficiencyModule 禁用最低效模块", function () {
  setup();
  // mock metrics
  var mockMetrics = { getModuleEfficiency: function (id) { return id === "memory" ? 50 : 90; } };
  var r = mm.disableLowEfficiencyModule("memory", mockMetrics);
  assert.ok(r);
  assert.strictEqual(r.disabledModuleId, "memory");
  assert.strictEqual(mm.get_module_info({ module_id: "memory" }).enabled, false);
});

console.log("");
