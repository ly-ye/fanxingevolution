/*
 * 测试共享 mock - 模拟 Operit QuickJS 运行时环境
 * 提供 localStorage + ToolPkg.registerXxx + ipc.on/call(async) + readResource(async)
 * 创作者：夜
 */

// 简易 require shim 供测试加载 packages（按裸名解析到 packages 目录）
var Module = require("module");
var origResolve = Module._resolveFilename;
var path = require("path");

var PACKAGES_DIR = path.resolve(__dirname, "..", "packages");
var ROOT_DIR = path.resolve(__dirname, "..");

// 让 require("event_bus") 等裸名解析到 packages 目录；require("./modules/modules_index.js") 解析到根
Module._resolveFilename = function (request, parent) {
  if (["event_bus", "metrics", "evolution_core", "module_manager", "stability_signal"].indexOf(request) >= 0) {
    try {
      return origResolve.call(this, path.join(PACKAGES_DIR, request + ".js"), parent);
    } catch (e) { /* fall through */ }
  }
  return origResolve.apply(this, arguments);
};

// ============ 内存 localStorage（Web Storage API 同步语义）============

function makeLocalStorage() {
  var store = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
    },
    removeItem: function (key) {
      delete store[key];
    },
    clear: function () {
      store = {};
    },
    _data: function () { return store; }
  };
}

// ============ mock ToolPkg（真实 Operit API 形态）============

function makeMockToolPkg(opts) {
  opts = opts || {};
  var ipcHandlers = {};
  var registered = {
    uiRoutes: [],
    toolboxUiModules: [],
    navigationEntries: [],
    lifecycleHooks: [],
    toolLifecycleHooks: [],
    systemPromptComposeHooks: [],
    desktopWidgets: [],
    resources: opts.resources || {} // key -> content
  };

  return {
    // 注册函数（记录调用）
    registerUiRoute: function (spec) { registered.uiRoutes.push(spec); },
    registerToolboxUiModule: function (spec) { registered.toolboxUiModules.push(spec); },
    registerNavigationEntry: function (spec) { registered.navigationEntries.push(spec); },
    registerAppLifecycleHook: function (spec) { registered.lifecycleHooks.push(spec); },
    registerToolLifecycleHook: function (spec) { registered.toolLifecycleHooks.push(spec); },
    registerSystemPromptComposeHook: function (spec) { registered.systemPromptComposeHooks.push(spec); },
    registerDesktopWidget: function (spec) { registered.desktopWidgets.push(spec); },
    // IPC：on 注册，call 异步调用（返回 Promise，匹配真实 ipc.call 语义）
    ipc: {
      on: function (name, handler) { ipcHandlers[name] = handler; },
      call: function (name, payload) {
        var h = ipcHandlers[name];
        if (!h) return Promise.resolve({ error: "no_handler: " + name });
        try {
          var r = h(payload || {});
          // 若 handler 返回 Promise 则等待，否则包装
          if (r && typeof r.then === "function") return r;
          return Promise.resolve(r);
        } catch (e) {
          return Promise.resolve({ error: String(e && e.message || e) });
        }
      },
      // 同步触发（仅供测试内部断言用，非真实 API）
      emitSync: function (name, payload) {
        var h = ipcHandlers[name];
        if (!h) return { error: "no_handler: " + name };
        try { return h(payload || {}); } catch (e) { return { error: String(e && e.message || e) }; }
      },
      _handlers: ipcHandlers
    },
    // 异步资源读取
    readResource: function (key) {
      var content = Object.prototype.hasOwnProperty.call(registered.resources, key)
        ? registered.resources[key] : null;
      return Promise.resolve(content);
    },
    _registered: registered,
    _reset: function () {
      // 清空现有对象而非重新赋值，保证 ipc._handlers 引用 + 闭包引用同时有效
      Object.keys(ipcHandlers).forEach(function (k) { delete ipcHandlers[k]; });
      registered.uiRoutes = [];
      registered.toolboxUiModules = [];
      registered.navigationEntries = [];
      registered.lifecycleHooks = [];
      registered.toolLifecycleHooks = [];
      registered.systemPromptComposeHooks = [];
      registered.desktopWidgets = [];
    }
  };
}

// 安装全局 localStorage 与 ToolPkg（供 main.js / UI 使用）
function installGlobals(opts) {
  var localStorageMock = makeLocalStorage();
  var toolPkgMock = makeMockToolPkg(opts);
  globalThis.localStorage = localStorageMock;
  globalThis.ToolPkg = toolPkgMock;
  return { localStorage: localStorageMock, ToolPkg: toolPkgMock };
}

module.exports = {
  makeLocalStorage: makeLocalStorage,
  makeMockToolPkg: makeMockToolPkg,
  installGlobals: installGlobals
};
