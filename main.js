/*
 * 繁星·自进化内核 - 主入口（ToolPkg registerToolPkg 约定）
 * 适配 Operit QuickJS 运行时：localStorage 持久化 + ToolPkg.registerXxx 注册
 * 创作者：夜
 */

(function () {
  "use strict";

  var ToolPkg = (typeof globalThis !== "undefined" && globalThis.ToolPkg) || null;

  var eventBus = require("./packages/event_bus.js");
  var metrics = require("./packages/metrics.js");
  var evolution = require("./packages/evolution_core.js");
  var moduleManager = require("./packages/module_manager.js");
  var stability = require("./packages/stability_signal.js");

  var STATE_KEY = "fanxing_evolution_state";
  var CONFIG_KEY = "fanxing_evolution_config";
  var DEFAULT_STATE = {
    generation: 0,
    isRunning: false,
    evolutionMode: "standard",
    efficiencyBaseline: 70,
    lastDrainedSeq: 0,
    lastDrainedTimestamp: 0,
    modules: {},
    customModules: [],
    skillMappings: {},
    moduleUsage: {},
    evolutionLog: [],
    metricsSnapshot: null
  };

  var systemState = Object.assign({}, DEFAULT_STATE);
  var config = {
    auto_start: false,
    evolution_mode: "standard",
    efficiency_baseline: 70,
    max_log_entries: 100,
    auto_save_interval: 60
  };
  var autoSaveTimerId = null;
  var initialized = false;

  // ============ 持久化（localStorage，Web Storage API 同步）============

  function _getStorage() {
    return (typeof localStorage !== "undefined") ? localStorage : null;
  }

  function saveState() {
    var st = _getStorage();
    if (!st) {
      _log("system", "存储不可用，状态仅内存");
      return false;
    }
    try {
      st.setItem(STATE_KEY, JSON.stringify({
        state: systemState,
        metricsSnapshot: metrics.snapshot()
      }));
      return true;
    } catch (e) {
      _log("system", "状态保存失败：" + String(e && e.message || e));
      return false;
    }
  }

  function loadPersistedState() {
    var st = _getStorage();
    if (!st) return false;
    try {
      var raw = st.getItem(STATE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data.state) {
        Object.assign(systemState, data.state);
      }
      if (data.metricsSnapshot) {
        metrics.loadSnapshot(data.metricsSnapshot);
      }
      return true;
    } catch (e) {
      _log("system", "状态加载失败：" + String(e && e.message || e));
      return false;
    }
  }

  function loadConfiguration() {
    var st = _getStorage();
    if (!st) return;
    try {
      var raw = st.getItem(CONFIG_KEY);
      if (!raw) return;
      var cfg = JSON.parse(raw);
      config.auto_start = cfg.auto_start !== undefined ? !!cfg.auto_start : false;
      config.evolution_mode = cfg.evolution_mode || "standard";
      config.efficiency_baseline = (typeof cfg.efficiency_baseline === "number") ? cfg.efficiency_baseline : 70;
      config.max_log_entries = cfg.max_log_entries || 100;
      config.auto_save_interval = cfg.auto_save_interval || 60;
    } catch (e) {
      _log("system", "配置加载失败：" + String(e && e.message || e));
    }
  }

  function saveConfiguration() {
    var st = _getStorage();
    if (!st) return false;
    try {
      st.setItem(CONFIG_KEY, JSON.stringify(config));
      return true;
    } catch (e) { return false; }
  }

  // ============ 初始化 ============

  function _initSubpackages() {
    moduleManager._setRuntime({
      state: systemState
    });
    evolution._setRuntime({
      state: systemState,
      eventBus: eventBus,
      metrics: metrics,
      moduleManager: moduleManager,
      efficiencyBaseline: config.efficiency_baseline,
      evolutionMode: config.evolution_mode,
      autoStart: config.auto_start,
      maxLogEntries: config.max_log_entries
    });
    stability._setRuntime({
      metrics: metrics,
      moduleManager: moduleManager,
      moduleUpperLimit: evolution.MODULE_UPPER_LIMIT
    });
  }

  function _log(type, message, data) {
    if (!systemState.evolutionLog) systemState.evolutionLog = [];
    var entry = {
      generation: systemState.generation || 0,
      timestamp: Date.now(),
      type: type,
      message: message,
      data: data || null
    };
    systemState.evolutionLog.unshift(entry);
    if (systemState.evolutionLog.length > config.max_log_entries) {
      systemState.evolutionLog.length = config.max_log_entries;
    }
  }

  // ============ IPC 注册（async 兼容 ipc.call）============

  function _wrapHandler(fn) {
    return function (payload) {
      try {
        return fn(payload || {});
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
    };
  }

  function _wrapAsyncHandler(fn) {
    return async function (payload) {
      try {
        return await fn(payload || {});
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
    };
  }

  function registerIpcHandlers() {
    if (!ToolPkg || !ToolPkg.ipc || typeof ToolPkg.ipc.on !== "function") return;

    ToolPkg.ipc.on("sea.get_state", _wrapHandler(function () {
      return _getStateForExternal();
    }));
    ToolPkg.ipc.on("sea.start_system", _wrapHandler(function () {
      return evolution.start_evolution();
    }));
    ToolPkg.ipc.on("sea.stop_system", _wrapHandler(function () {
      return evolution.stop_evolution();
    }));
    ToolPkg.ipc.on("sea.toggle_system", _wrapHandler(function (p) {
      if (systemState.isRunning) return evolution.stop_evolution();
      return evolution.start_evolution();
    }));
    ToolPkg.ipc.on("sea.toggle_module", _wrapHandler(function (p) {
      var id = p.module_id;
      if (!id) return { success: false, reason: "missing_module_id" };
      var info = moduleManager.get_module_info({ module_id: id });
      if (info.error) return { success: false, reason: info.error };
      return info.enabled
        ? moduleManager.disable_module({ module_id: id })
        : moduleManager.enable_module({ module_id: id });
    }));
    ToolPkg.ipc.on("sea.toggle_all", _wrapHandler(function (p) {
      return p.enabled ? moduleManager.enable_all_modules() : moduleManager.disable_all_modules();
    }));
    ToolPkg.ipc.on("sea.toggle_category", _wrapHandler(function (p) {
      return p.enabled
        ? moduleManager.enable_category({ category: p.category })
        : moduleManager.disable_category({ category: p.category });
    }));
    ToolPkg.ipc.on("sea.set_evolution_mode", _wrapHandler(function (p) {
      var r = evolution.set_evolution_mode({ mode: p.mode });
      if (r.success) systemState.evolutionMode = p.mode;
      return r;
    }));
    ToolPkg.ipc.on("sea.add_custom_module", _wrapHandler(function (p) {
      return moduleManager.add_custom_module({ name: p.name, description: p.description });
    }));
    ToolPkg.ipc.on("sea.remove_custom_module", _wrapHandler(function (p) {
      return moduleManager.remove_custom_module({ module_id: p.module_id });
    }));
    ToolPkg.ipc.on("sea.trigger_evolution", _wrapHandler(function () {
      return evolution.trigger_evolution();
    }));
    ToolPkg.ipc.on("sea.get_evolution_loop", _wrapHandler(function () {
      return evolution.get_evolution_loop_info();
    }));
    ToolPkg.ipc.on("sea.get_evolution_log", _wrapHandler(function (p) {
      return evolution.get_evolution_log({ limit: p.limit });
    }));
    ToolPkg.ipc.on("sea.clear_log", _wrapHandler(function () {
      return evolution.clear_evolution_log();
    }));
    ToolPkg.ipc.on("sea.set_auto_start", _wrapHandler(function (p) {
      var r = evolution.toggle_auto_start({ enabled: p.enabled });
      config.auto_start = !!(p.enabled);
      saveConfiguration();
      return r;
    }));
    ToolPkg.ipc.on("sea.read_module_doc", _wrapHandler(function (p) {
      return moduleManager.get_module_doc({ module_id: p.module_id });
    }));
    ToolPkg.ipc.on("sea.save_state", _wrapHandler(function () {
      return { success: saveState() };
    }));
    ToolPkg.ipc.on("sea.list_modules", _wrapHandler(function (p) {
      return moduleManager.list_modules({ category: (p && p.category) || "all" });
    }));

    // 事件驱动 + 稳定性信号
    ToolPkg.ipc.on("sea.submit_event", _wrapHandler(function (p) {
      return eventBus.submit(p);
    }));
    ToolPkg.ipc.on("sea.get_stability_signal", _wrapHandler(function () {
      return stability.get_stability_signal();
    }));
    ToolPkg.ipc.on("sea.get_evolution_drift", _wrapHandler(function () {
      return stability.get_evolution_drift();
    }));
    ToolPkg.ipc.on("sea.map_skill", _wrapHandler(function (p) {
      return moduleManager.map_skill_module({
        skillId: p.skillId,
        moduleId: p.moduleId,
        exclusive: p.exclusive
      });
    }));
    ToolPkg.ipc.on("sea.unmap_skill", _wrapHandler(function (p) {
      return moduleManager.unmap_skill_module({ skillId: p.skillId });
    }));
    ToolPkg.ipc.on("sea.get_skill_mapping", _wrapHandler(function (p) {
      return moduleManager.get_skill_mapping({ skillId: p.skillId, moduleId: p.moduleId });
    }));
    ToolPkg.ipc.on("sea.disable_module_safe", _wrapHandler(function (p) {
      return moduleManager.safe_disable_module({ module_id: p.module_id });
    }));

    // 异步：通过 ToolPkg.readResource 读取打包资源（fanxing_guide）
    ToolPkg.ipc.on("sea.read_resource", _wrapAsyncHandler(async function (p) {
      var key = p && p.resource_key;
      if (!key) return { error: "missing_resource_key" };
      if (!ToolPkg || typeof ToolPkg.readResource !== "function") {
        return { error: "readResource_unavailable" };
      }
      var content = await ToolPkg.readResource(key);
      return { resource_key: key, content: content };
    }));
    ToolPkg.ipc.on("sea.get_demo_guide", _wrapAsyncHandler(async function () {
      if (!ToolPkg || typeof ToolPkg.readResource !== "function") {
        return { error: "readResource_unavailable" };
      }
      var content = await ToolPkg.readResource("fanxing_guide");
      return { content: content };
    }));

    // === 角色卡工具名别名（对齐 fanxing 角色卡期望的工具名，减少探测开销）===
    // evolution_core 工具
    ToolPkg.ipc.on("start_evolution", _wrapHandler(function () { return evolution.start_evolution(); }));
    ToolPkg.ipc.on("stop_evolution", _wrapHandler(function () { return evolution.stop_evolution(); }));
    ToolPkg.ipc.on("get_system_status", _wrapHandler(function () { return _getStateForExternal(); }));
    ToolPkg.ipc.on("get_evolution_loop_info", _wrapHandler(function () { return evolution.get_evolution_loop_info(); }));
    ToolPkg.ipc.on("get_generation_report", _wrapHandler(function () { return evolution.get_generation_report(); }));
    ToolPkg.ipc.on("clear_evolution_log", _wrapHandler(function () { return evolution.clear_evolution_log(); }));
    ToolPkg.ipc.on("process_task", _wrapHandler(function (p) { return evolution.process_task(p); }));
    ToolPkg.ipc.on("toggle_auto_start", _wrapHandler(function (p) {
      var r = evolution.toggle_auto_start({ enabled: p.enabled });
      config.auto_start = !!(p.enabled);
      saveConfiguration();
      return r;
    }));
    // module_manager 工具
    ToolPkg.ipc.on("enable_module", _wrapHandler(function (p) { return moduleManager.enable_module({ module_id: p.module_id }); }));
    ToolPkg.ipc.on("disable_module", _wrapHandler(function (p) { return moduleManager.disable_module({ module_id: p.module_id }); }));
    ToolPkg.ipc.on("enable_category", _wrapHandler(function (p) { return moduleManager.enable_category({ category: p.category }); }));
    ToolPkg.ipc.on("disable_category", _wrapHandler(function (p) { return moduleManager.disable_category({ category: p.category }); }));
    ToolPkg.ipc.on("enable_all", _wrapHandler(function () { return moduleManager.enable_all_modules(); }));
    ToolPkg.ipc.on("disable_all", _wrapHandler(function () { return moduleManager.disable_all_modules(); }));
    ToolPkg.ipc.on("get_module_info", _wrapHandler(function (p) { return moduleManager.get_module_info({ module_id: p.module_id }); }));
    ToolPkg.ipc.on("get_module_doc", _wrapHandler(function (p) { return moduleManager.get_module_doc({ module_id: p.module_id }); }));
  }

  function _getStateForExternal() {
    var status = evolution.get_system_status();
    return {
      isRunning: status.isRunning,
      generation: status.generation,
      evolutionMode: status.evolutionMode,
      efficiencyBaseline: status.efficiencyBaseline,
      totalEnabledModules: status.totalEnabledModules,
      moduleUpperLimit: status.moduleUpperLimit,
      moduleBloat: status.moduleBloat,
      evolutionDrift: status.evolutionDrift,
      driftGenerations: status.driftGenerations,
      knowledgeGrowth: status.knowledgeGrowth,
      autoStart: config.auto_start,
      lastCycleTimestamp: status.lastCycleTimestamp
    };
  }

  // ============ 自动保存 ============

  function _startAutoSave() {
    if (typeof setTimeout !== "function") return;
    if (autoSaveTimerId) clearTimeout(autoSaveTimerId);
    var interval = (config.auto_save_interval || 60) * 1000;
    autoSaveTimerId = setTimeout(function () {
      saveState();
      _startAutoSave();
    }, interval);
  }

  function _stopAutoSave() {
    if (autoSaveTimerId) { clearTimeout(autoSaveTimerId); autoSaveTimerId = null; }
  }

  // ============ 生命周期钩子 ============

  function onApplicationCreate() {
    if (initialized) return;
    initialized = true;
    _initSubpackages();
    loadConfiguration();
    loadPersistedState();
    _initSubpackages(); // 二次注入，确保 metrics 加载后的状态生效
    registerIpcHandlers();
    _log("system", "繁星·自进化内核已加载");
    if (config.auto_start) {
      evolution.start_evolution();
    }
    _startAutoSave();
    return { ok: true };
  }

  function onApplicationForeground() {
    if (systemState.isRunning) {
      evolution.start_evolution();
    }
    _startAutoSave();
    return { ok: true };
  }

  function onApplicationBackground() {
    evolution.stop_evolution();
    saveState();
    _stopAutoSave();
    return { ok: true };
  }

  function onToolPkgInstall() {
    _log("system", "插件安装完成");
    saveState();
    return { ok: true };
  }

  function onToolPkgUninstall() {
    evolution.stop_evolution();
    _stopAutoSave();
    var st = _getStorage();
    if (st) { try { st.removeItem(STATE_KEY); } catch (e) {} }
    return { ok: true };
  }

  function onToolPkgEnable() {
    _initSubpackages();
    loadPersistedState();
    _initSubpackages();
    _log("system", "插件已启用");
    if (config.auto_start) {
      evolution.start_evolution();
    }
    _startAutoSave();
    return { ok: true };
  }

  function onToolPkgDisable() {
    evolution.stop_evolution();
    saveState();
    _stopAutoSave();
    return { ok: true };
  }

  // ============ ToolPkg 注册入口 ============

  function registerToolPkg() {
    // 1. 注册 UI 路由 + 工具箱模块 + 导航入口
    if (ToolPkg && typeof ToolPkg.registerUiRoute === "function") {
      var dashboardScreen = require("./ui/dashboard/index.ui.js").default;
      ToolPkg.registerUiRoute({
        id: "fanxing_dashboard",
        runtime: "compose_dsl",
        screen: dashboardScreen,
        params: {},
        title: { zh: "繁星·自进化内核", en: "Fanxing Evolution" }
      });
    }
    if (ToolPkg && typeof ToolPkg.registerToolboxUiModule === "function") {
      var tbScreen = require("./ui/dashboard/index.ui.js").default;
      ToolPkg.registerToolboxUiModule({
        id: "fanxing_evolution_dashboard",
        runtime: "compose_dsl",
        screen: tbScreen,
        params: {},
        title: { zh: "繁星·自进化内核", en: "Fanxing Evolution" }
      });
    }
    if (ToolPkg && typeof ToolPkg.registerNavigationEntry === "function") {
      ToolPkg.registerNavigationEntry({
        id: "fanxing_dashboard_nav",
        route: "toolpkg:com.ye.fanxing_evolution:ui:fanxing_dashboard",
        surface: "toolbox",
        title: { zh: "繁星·自进化内核", en: "Fanxing Evolution" },
        icon: "auto_awesome",
        order: 100
      });
      // 侧边栏导航入口（Operit 新 surface）
      ToolPkg.registerNavigationEntry({
        id: "fanxing_sidebar_nav",
        route: "toolpkg:com.ye.fanxing_evolution:ui:fanxing_dashboard",
        surface: "main_sidebar_plugins",
        title: { zh: "繁星·自进化内核", en: "Fanxing Evolution" },
        icon: "auto_awesome",
        order: 100
      });
    }

    // 2. 注册生命周期钩子
    if (ToolPkg && typeof ToolPkg.registerAppLifecycleHook === "function") {
      ToolPkg.registerAppLifecycleHook({
        id: "fanxing_on_create",
        event: "application_on_create",
        function: onApplicationCreate
      });
      ToolPkg.registerAppLifecycleHook({
        id: "fanxing_on_foreground",
        event: "application_on_foreground",
        function: onApplicationForeground
      });
      ToolPkg.registerAppLifecycleHook({
        id: "fanxing_on_background",
        event: "application_on_background",
        function: onApplicationBackground
      });
    }

    // 3. 注册工具生命周期钩子（自动收集工具调用事件 → push 到事件总线）
    if (ToolPkg && typeof ToolPkg.registerToolLifecycleHook === "function") {
      ToolPkg.registerToolLifecycleHook({
        id: "fanxing_tool_result",
        event: "tool_execution_result",
        function: function (payload) {
          try {
            eventBus.submit({
              type: "task_result",
              success: payload.success !== false,
              modulesUsed: payload.modulesUsed || [],
              durationMs: payload.durationMs || 0,
              complexity: payload.complexity || 0.5
            });
          } catch (e) { /* 忽略收集错误 */ }
          return { action: "allow" };
        }
      });
      ToolPkg.registerToolLifecycleHook({
        id: "fanxing_tool_error",
        event: "tool_execution_error",
        function: function (payload) {
          try {
            eventBus.submit({
              type: "error_path",
              moduleId: payload.moduleId || null,
              errorType: payload.errorType || "tool_fail",
              recovered: false
            });
          } catch (e) { /* 忽略 */ }
          return { action: "allow" };
        }
      });
    }

    // 4. 注册系统提示词组合钩子（注入进化状态摘要到繁星系统提示词）
    if (ToolPkg && typeof ToolPkg.registerSystemPromptComposeHook === "function") {
      ToolPkg.registerSystemPromptComposeHook({
        id: "fanxing_prompt_inject",
        event: "compose_system_prompt_sections",
        function: function () {
          try {
            var status = evolution.get_system_status();
            var driftText = status.evolutionDrift ? "检测到漂移(" + status.driftGenerations + "代)" : "稳定";
            var section = {
              title: "进化状态摘要",
              content: "代数:" + status.generation +
                " 模式:" + status.evolutionMode +
                " 启用模块:" + status.totalEnabledModules + "/" + status.moduleUpperLimit +
                " 知识增长:" + status.knowledgeGrowth.toFixed(2) +
                " 漂移:" + driftText
            };
            return { sections: [section] };
          } catch (e) {
            return { sections: [] };
          }
        }
      });
    }

    // 5. 注册桌面小组件（Operit 新能力，桌面显示进化状态）
    if (ToolPkg && typeof ToolPkg.registerDesktopWidget === "function") {
      ToolPkg.registerDesktopWidget({
        id: "fanxing_widget",
        route: "toolpkg:com.ye.fanxing_evolution:ui:fanxing_dashboard",
        title: { zh: "繁星进化", en: "Fanxing Evolution" },
        subtitle: { zh: "自进化内核", en: "Self-Evolving Core" },
        description: { zh: "显示进化状态概览", en: "Evolution status overview" },
        icon: "auto_awesome",
        order: 100
      });
    }

    // 3. 注册 IPC handlers（也在 onApplicationCreate 注册，此处提前注册供早期调用）
    registerIpcHandlers();

    return true;
  }

  // ============ 导出 ============

  exports.registerToolPkg = registerToolPkg;
  // 生命周期（供宿主直接调用或测试）
  exports.onApplicationCreate = onApplicationCreate;
  exports.onApplicationForeground = onApplicationForeground;
  exports.onApplicationBackground = onApplicationBackground;
  exports.onToolPkgInstall = onToolPkgInstall;
  exports.onToolPkgUninstall = onToolPkgUninstall;
  exports.onToolPkgEnable = onToolPkgEnable;
  exports.onToolPkgDisable = onToolPkgDisable;
  // 状态/持久化
  exports.saveState = saveState;
  exports.loadPersistedState = loadPersistedState;
  exports.loadConfiguration = loadConfiguration;
  exports.saveConfiguration = saveConfiguration;
  // 子包引用（供测试）
  exports._eventBus = eventBus;
  exports._metrics = metrics;
  exports._evolution = evolution;
  exports._moduleManager = moduleManager;
  exports._stability = stability;
  exports._state = systemState;
  exports._config = config;
  exports._initSubpackages = _initSubpackages;
  exports._registerIpcHandlers = registerIpcHandlers;
})();
