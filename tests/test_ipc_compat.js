/*
 * 测试 - IPC 兼容性 + ToolPkg 注册约定 + localStorage 持久化
 * 创作者：夜
 */

require("./mock_toolpkg"); // 注册 require shim
var assert = require("assert");
var path = require("path");
var fs = require("fs");

var mock = require("./mock_toolpkg");

var passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(function () { return fn(); }).then(function () {
    passed++;
    console.log("  PASS  " + name);
  }).catch(function (e) {
    failed++;
    console.log("  FAIL  " + name + " :: " + e.message);
    throw e;
  });
}

console.log("test_ipc_compat.js");

(async function () {
  // 安装全局 localStorage + ToolPkg（带 fanxing_guide 资源）
  var env = mock.installGlobals({ resources: { fanxing_guide: "# 繁星指南\n测试内容" } });
  var localStorageMock = env.localStorage;
  var toolPkgMock = env.ToolPkg;

  // 每个测试前重置 main 模块缓存，确保 onApplicationCreate 的 initialized 标志重置
  function freshMain() {
    delete require.cache[require.resolve("../main.js")];
    return require("../main.js");
  }

  await test("main.js 导出 registerToolPkg", function () {
    var main = freshMain();
    assert.ok(typeof main.registerToolPkg === "function", "应导出 registerToolPkg");
    assert.ok(typeof main.onApplicationCreate === "function");
    assert.ok(typeof main.saveState === "function");
  });

  await test("registerToolPkg 注册 UI 路由/工具箱模块/导航入口/生命周期钩子", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    var reg = toolPkgMock._registered;
    assert.ok(reg.uiRoutes.length >= 1, "应注册 UI 路由");
    assert.ok(reg.toolboxUiModules.length >= 1, "应注册工具箱 UI 模块");
    assert.ok(reg.navigationEntries.length >= 1, "应注册导航入口");
    assert.ok(reg.lifecycleHooks.length >= 3, "应注册至少 3 个生命周期钩子");
    // 验证生命周期事件
    var events = reg.lifecycleHooks.map(function (h) { return h.event; });
    assert.ok(events.indexOf("application_on_create") >= 0, "缺 application_on_create");
  });

  await test("registerToolPkg 返回 true", function () {
    var main = freshMain();
    assert.strictEqual(main.registerToolPkg(), true);
  });

  await test("onApplicationCreate 注册 IPC handler", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var handlers = toolPkgMock.ipc._handlers;
    ["sea.get_state", "sea.start_system", "sea.stop_system", "sea.toggle_system",
     "sea.toggle_module", "sea.toggle_all", "sea.toggle_category", "sea.set_evolution_mode",
     "sea.add_custom_module", "sea.remove_custom_module", "sea.trigger_evolution",
     "sea.get_evolution_loop", "sea.get_evolution_log", "sea.clear_log", "sea.set_auto_start",
     "sea.read_module_doc", "sea.save_state", "sea.list_modules",
     "sea.submit_event", "sea.get_stability_signal", "sea.get_evolution_drift",
     "sea.map_skill", "sea.unmap_skill", "sea.get_skill_mapping", "sea.disable_module_safe",
     "sea.read_resource", "sea.get_demo_guide"].forEach(function (name) {
      assert.ok(handlers[name], "缺 handler: " + name);
    });
  });

  await test("同步 IPC（emitSync）调用不抛错", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var emit = function (name, p) { return toolPkgMock.ipc.emitSync(name, p || {}); };
    emit("sea.get_state");
    emit("sea.start_system");
    emit("sea.trigger_evolution");
    emit("sea.get_evolution_log", { limit: 10 });
    emit("sea.get_evolution_loop");
    var st = emit("sea.get_state");
    assert.ok(typeof st.isRunning !== "undefined", "get_state 应返回 isRunning");
  });

  await test("异步 IPC（ipc.call）返回 Promise", async function () {
    var main = freshMain();
    main.onApplicationCreate();
    var p = toolPkgMock.ipc.call("sea.get_state");
    assert.ok(typeof p.then === "function", "ipc.call 应返回 Promise");
    var st = await p;
    assert.ok(typeof st.isRunning !== "undefined");
  });

  await test("submit_event 接收事件", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var r = toolPkgMock.ipc.emitSync("sea.submit_event", {
      type: "task_result", success: true, modulesUsed: [], durationMs: 100, complexity: 0.5
    });
    assert.strictEqual(r.success, true);
  });

  await test("map_skill / disable_module_safe 联动", function () {
    var main = freshMain();
    main.onApplicationCreate();
    main._initSubpackages();
    var mapR = toolPkgMock.ipc.emitSync("sea.map_skill", { skillId: "s1", moduleId: "memory", exclusive: true });
    assert.strictEqual(mapR.success, true);
    var safeR = toolPkgMock.ipc.emitSync("sea.disable_module_safe", { module_id: "memory" });
    assert.strictEqual(safeR.success, false);
    assert.strictEqual(safeR.reason, "skill_dependent");
  });

  await test("list_modules IPC 返回 48 模块", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var r = toolPkgMock.ipc.emitSync("sea.list_modules", { category: "all" });
    assert.strictEqual(r.total, 48);
  });

  await test("saveState/loadPersistedState 往返（localStorage）", function () {
    var main = freshMain();
    main.onApplicationCreate();
    main._state.generation = 42;
    main._state.evolutionLog.push({ generation: 42, timestamp: Date.now(), type: "test", message: "test" });
    var saveR = main.saveState();
    assert.strictEqual(saveR, true, "localStorage 可用时 saveState 应返回 true");
    // 重新加载
    main._state.generation = 0;
    main.loadPersistedState();
    assert.strictEqual(main._state.generation, 42);
  });

  await test("异步 readResource IPC 读取 fanxing_guide", async function () {
    var main = freshMain();
    main.onApplicationCreate();
    var r = await toolPkgMock.ipc.call("sea.get_demo_guide");
    assert.ok(typeof r.content === "string", "应返回 guide 内容");
    assert.ok(r.content.indexOf("繁星指南") >= 0);
  });

  await test("无硬编码模块数 83", function () {
    var dir = path.resolve(__dirname, "..");
    var files = ["main.js", "packages/evolution_core.js", "packages/module_manager.js",
                 "packages/metrics.js", "packages/stability_signal.js", "packages/event_bus.js"];
    files.forEach(function (f) {
      var content = fs.readFileSync(path.join(dir, f), "utf8");
      assert.ok(content.indexOf("=== 83") < 0, f + " 不应硬编码 83");
      assert.ok(content.indexOf("== 83") < 0, f + " 不应硬编码 83");
    });
  });

  await test("UI 导出 default async screen function", async function () {
    var ui = require("../ui/dashboard/index.ui.js");
    assert.ok(typeof ui.default === "function", "UI 应导出 default 函数");
    // 注入 ToolPkg 已安装，screen 调用 ipc.call
    var main = freshMain();
    main.onApplicationCreate();
    var tree = await ui.default({});
    assert.ok(tree && tree.type === "Column", "screen 应返回 Column 树");
    assert.ok(Array.isArray(tree.children), "树应有 children");
  });

  console.log("");
  console.log("  小计: 通过 " + passed + "  失败 " + failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.log("  异常退出: " + e.message);
  process.exit(1);
});
