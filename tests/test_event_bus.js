/*
 * 测试 - event_bus
 * 创作者：夜
 */

require("./mock_toolpkg"); // 注册 require shim
var assert = require("assert");
var eventBus = require("event_bus");

function test(name, fn) {
  try {
    eventBus._reset();
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  }
}

console.log("test_event_bus.js");

test("submit 4 种事件类型入队成功", function () {
  var r1 = eventBus.submit({ type: "task_result", success: true, modulesUsed: ["memory"], durationMs: 100, complexity: 0.5 });
  var r2 = eventBus.submit({ type: "skill_update", skillId: "s1", delta: 0.1, success: 1 });
  var r3 = eventBus.submit({ type: "error_path", errorType: "tool_fail", recovered: true });
  var r4 = eventBus.submit({ type: "module_toggle", moduleId: "memory", enabled: true });

  assert.strictEqual(r1.success, true);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(eventBus.size(), 4);
  var s = eventBus.getStats();
  assert.strictEqual(s.accepted, 4);
  assert.strictEqual(s.byType.task_result, 1);
  assert.strictEqual(s.byType.skill_update, 1);
  assert.strictEqual(s.byType.error_path, 1);
  assert.strictEqual(s.byType.module_toggle, 1);
});

test("校验失败丢弃：缺字段", function () {
  var r = eventBus.submit({ type: "task_result", success: true }); // 缺 modulesUsed/durationMs/complexity
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "invalid_fields");
  assert.strictEqual(eventBus.size(), 0);
  assert.strictEqual(eventBus.getStats().rejected, 1);
});

test("校验失败丢弃：非法类型", function () {
  var r = eventBus.submit({ type: "unknown", foo: 1 });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "invalid_type");
});

test("校验失败丢弃：非对象", function () {
  var r = eventBus.submit("not_object");
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, "not_object");
});

test("环形缓冲溢出丢弃最旧", function () {
  eventBus._setCapacity(3);
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 1, complexity: 0.1 });
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 2, complexity: 0.1 });
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 3, complexity: 0.1 });
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 4, complexity: 0.1 });

  assert.strictEqual(eventBus.size(), 3);
  var drained = eventBus.drain(0);
  assert.strictEqual(drained.length, 3);
  // 第一个（durationMs=1）应被丢弃
  assert.strictEqual(drained[0].payload.durationMs, 2);
  assert.strictEqual(drained[2].payload.durationMs, 4);
  assert.strictEqual(eventBus.getStats().overflowed, 1);
});

test("drain 按 seq 过滤", function () {
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 1, complexity: 0.1 });
  var all = eventBus.drain(0);
  var seq1 = all[0].seq;
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 2, complexity: 0.1 });
  // 用 seq1 过滤，返回 seq > seq1 的事件
  var after = eventBus.drain(seq1);
  assert.strictEqual(after.length, 1);
  assert.strictEqual(after[0].payload.durationMs, 2);
});

test("clear 重置缓冲", function () {
  eventBus.submit({ type: "task_result", success: true, modulesUsed: [], durationMs: 1, complexity: 0.1 });
  eventBus.clear();
  assert.strictEqual(eventBus.size(), 0);
});

test("module_toggle 校验 moduleId 必填", function () {
  var r = eventBus.submit({ type: "module_toggle", enabled: true }); // 缺 moduleId
  assert.strictEqual(r.success, false);
});

console.log("");
