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
     "sea.read_resource", "sea.get_demo_guide",
     // v1.1.0 角色卡工具名别名
     "start_evolution", "stop_evolution", "get_system_status", "get_evolution_loop_info",
     "get_generation_report", "clear_evolution_log", "process_task", "toggle_auto_start",
     "enable_module", "disable_module", "enable_category", "disable_category",
     "enable_all", "disable_all", "get_module_info", "get_module_doc"
    ].forEach(function (name) {
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

  // ============ v1.1.0 新增测试 ============

  await test("registerToolPkg 注册工具生命周期钩子", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    var reg = toolPkgMock._registered;
    assert.ok(reg.toolLifecycleHooks.length >= 2, "应注册至少 2 个工具生命周期钩子");
    var events = reg.toolLifecycleHooks.map(function (h) { return h.event; });
    assert.ok(events.indexOf("tool_execution_result") >= 0, "缺 tool_execution_result");
    assert.ok(events.indexOf("tool_execution_error") >= 0, "缺 tool_execution_error");
  });

  await test("registerToolPkg 注册系统提示词组合钩子", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    var reg = toolPkgMock._registered;
    assert.ok(reg.systemPromptComposeHooks.length >= 1, "应注册系统提示词组合钩子");
    var hook = reg.systemPromptComposeHooks[0];
    assert.ok(hook.event === "compose_system_prompt_sections", "事件名应为 compose_system_prompt_sections");
  });

  await test("registerToolPkg 注册桌面小组件", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    var reg = toolPkgMock._registered;
    assert.ok(reg.desktopWidgets.length >= 1, "应注册桌面小组件");
    assert.ok(reg.desktopWidgets[0].id === "fanxing_widget", "小组件 ID 应为 fanxing_widget");
  });

  await test("导航入口含 main_sidebar_plugins surface", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    var reg = toolPkgMock._registered;
    var surfaces = reg.navigationEntries.map(function (n) { return n.surface; });
    assert.ok(surfaces.indexOf("toolbox") >= 0, "应有 toolbox surface");
    assert.ok(surfaces.indexOf("main_sidebar_plugins") >= 0, "应有 main_sidebar_plugins surface");
  });

  await test("角色卡工具名别名 start_evolution 功能正常", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var r = toolPkgMock.ipc.emitSync("start_evolution");
    assert.strictEqual(r.success, true);
    var stopR = toolPkgMock.ipc.emitSync("stop_evolution");
    assert.strictEqual(stopR.success, true);
  });

  await test("角色卡工具名别名 get_system_status 返回完整状态", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var st = toolPkgMock.ipc.emitSync("get_system_status");
    assert.ok(typeof st.isRunning !== "undefined", "get_system_status 应返回 isRunning");
    assert.ok(typeof st.generation === "number", "get_system_status 应返回 generation");
  });

  await test("角色卡工具名别名 process_task 提交任务", function () {
    var main = freshMain();
    main.onApplicationCreate();
    var r = toolPkgMock.ipc.emitSync("process_task", { description: "测试任务" });
    assert.strictEqual(r.success, true);
  });

  await test("角色卡工具名别名 get_generation_report 返回报告", function () {
    var main = freshMain();
    main.onApplicationCreate();
    toolPkgMock.ipc.emitSync("trigger_evolution");
    var rep = toolPkgMock.ipc.emitSync("get_generation_report");
    assert.ok(rep.generation >= 1, "get_generation_report 应返回 generation");
    assert.ok(typeof rep.knowledgeGrowth === "number", "应返回 knowledgeGrowth");
  });

  await test("角色卡工具名别名 enable/disable_module 功能正常", function () {
    var main = freshMain();
    main.onApplicationCreate();
    main._initSubpackages();
    var disR = toolPkgMock.ipc.emitSync("disable_module", { module_id: "memory" });
    assert.strictEqual(disR.success, true);
    var info = toolPkgMock.ipc.emitSync("get_module_info", { module_id: "memory" });
    assert.strictEqual(info.enabled, false, "禁用后应为 false");
    var enR = toolPkgMock.ipc.emitSync("enable_module", { module_id: "memory" });
    assert.strictEqual(enR.success, true);
    var info2 = toolPkgMock.ipc.emitSync("get_module_info", { module_id: "memory" });
    assert.strictEqual(info2.enabled, true, "启用后应为 true");
  });

  await test("角色卡工具名别名 enable_all/disable_all 功能正常", function () {
    var main = freshMain();
    main.onApplicationCreate();
    main._initSubpackages();
    var disR = toolPkgMock.ipc.emitSync("disable_all");
    assert.strictEqual(disR.success, true);
    var enR = toolPkgMock.ipc.emitSync("enable_all");
    assert.strictEqual(enR.success, true);
  });

  await test("角色卡工具名别名 get_module_doc 读取文档", function () {
    var main = freshMain();
    main.onApplicationCreate();
    main._initSubpackages();
    var doc = toolPkgMock.ipc.emitSync("get_module_doc", { module_id: "memory" });
    assert.ok(doc.success !== false, "get_module_doc 应成功");
  });

  await test("工具生命周期钩子自动收集事件", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    main.onApplicationCreate();
    main._initSubpackages();
    // 找到 tool_execution_result 钩子并模拟调用
    var reg = toolPkgMock._registered;
    var resultHook = reg.toolLifecycleHooks.find(function (h) { return h.event === "tool_execution_result"; });
    assert.ok(resultHook, "应有 tool_execution_result 钩子");
    // 模拟工具执行完成
    var hookResult = resultHook.function({ success: true, modulesUsed: ["memory"], durationMs: 100 });
    assert.strictEqual(hookResult.action, "allow", "钩子应返回 allow");
    // 验证事件已被自动提交到事件总线
    var eb = main._eventBus;
    var events = eb.drain(0);
    var taskEvents = events.filter(function (e) { return e.payload.type === "task_result"; });
    assert.ok(taskEvents.length >= 1, "应自动提交 task_result 事件");
  });

  await test("系统提示词钩子注入进化状态摘要", function () {
    toolPkgMock._reset();
    var main = freshMain();
    main.registerToolPkg();
    main.onApplicationCreate();
    main._initSubpackages();
    var reg = toolPkgMock._registered;
    var promptHook = reg.systemPromptComposeHooks[0];
    var result = promptHook.function({});
    assert.ok(result.sections && result.sections.length >= 1, "应返回至少 1 个 section");
    assert.ok(result.sections[0].title === "进化状态摘要", "section 标题应为进化状态摘要");
    assert.ok(result.sections[0].content.indexOf("代数") >= 0, "内容应含代数信息");
  });

  console.log("");
  console.log("  小计: 通过 " + passed + "  失败 " + failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.log("  异常退出: " + e.message);
  process.exit(1);
});
