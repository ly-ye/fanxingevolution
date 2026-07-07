/*
 * 繁星·自进化内核 - 模块管理器
 * 48 模块管理 + Skill↔Module 映射 + 安全禁用
 * 数据源：内联 modules_index.js（无 fs/path 依赖，适配 QuickJS）
 * 创作者：夜
 */

(function () {
  "use strict";

  // 内联模块数据（QuickJS 无 fs/path，直接 require 内联 JS）
  var MODULES_DATA = require("../modules/modules_index.js");
  // 兼容 require 返回 DATA 属性或直接对象
  if (MODULES_DATA && MODULES_DATA.DATA && !MODULES_DATA.modules) {
    MODULES_DATA = MODULES_DATA.DATA;
  }

  var CATEGORY_NAMES = {
    perception: "感知 (1-5)",
    memory: "记忆 (6-8)",
    thinking: "思考 (9-16)",
    action: "行动 (17-25)",
    reflection: "反思 (26-30)",
    evolution: "进化 (31-37)",
    infrastructure: "基础设施 (38-45)",
    security: "安全扩展 (46-48)",
    custom: "自定义模块"
  };

  var runtime = {
    state: null
  };

  function _setRuntime(opts) {
    runtime.state = opts.state || runtime.state;
  }

  function _ensureState() {
    var st = runtime.state;
    if (!st) throw new Error("module_manager 未初始化 state");
    if (!st.modules) st.modules = {};
    if (!st.customModules) st.customModules = [];
    if (!st.skillMappings) st.skillMappings = {};
    if (!st.moduleUsage) st.moduleUsage = {};
  }

  function _getModuleDef(id) {
    var mods = MODULES_DATA.modules || [];
    for (var i = 0; i < mods.length; i++) {
      if (mods[i].id === id) return mods[i];
    }
    // 查自定义模块
    _ensureState();
    for (var j = 0; j < runtime.state.customModules.length; j++) {
      if (runtime.state.customModules[j].id === id) return runtime.state.customModules[j];
    }
    return null;
  }

  function _isModuleEnabled(id) {
    _ensureState();
    var def = _getModuleDef(id);
    if (!def) return false;
    if (def.category === "custom") {
      var cust = runtime.state.customModules.find(function (m) { return m.id === id; });
      return cust ? !!cust.enabled : false;
    }
    // 内置模块：st.modules[id] 默认 true（未设置则启用）
    var v = runtime.state.modules[id];
    return v === undefined ? true : !!v;
  }

  function _setModuleEnabled(id, enabled) {
    _ensureState();
    var def = _getModuleDef(id);
    if (!def) return false;
    if (def.category === "custom") {
      var cust = runtime.state.customModules.find(function (m) { return m.id === id; });
      if (cust) { cust.enabled = !!enabled; return true; }
      return false;
    }
    runtime.state.modules[id] = !!enabled;
    return true;
  }

  // ============ 工具函数（保留旧名）============

  function list_modules(args) {
    args = args || {};
    var category = args.category || "all";
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    var result = [];

    var collect = function (modDef) {
      result.push({
        id: modDef.id,
        name: modDef.name,
        category: modDef.category,
        index: modDef.index,
        stage: modDef.stage,
        description: modDef.description,
        enabled: _isModuleEnabled(modDef.id),
        usageCount: runtime.state.moduleUsage[modDef.id] || 0,
        mergedFrom: modDef.mergedFrom || null
      });
    };

    if (category === "all") {
      mods.forEach(collect);
      runtime.state.customModules.forEach(collect);
    } else if (category === "custom") {
      runtime.state.customModules.forEach(collect);
    } else {
      mods.filter(function (m) { return m.category === category; }).forEach(collect);
    }

    return {
      total: result.length,
      categories: CATEGORY_NAMES,
      modules: result
    };
  }

  function getModulesByStage(stageId) {
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    return mods
      .filter(function (m) { return m.stage === stageId; })
      .map(function (m) {
        return {
          id: m.id,
          name: m.name,
          enabled: _isModuleEnabled(m.id)
        };
      });
  }

  function enable_module(args) {
    var id = args && args.module_id;
    if (!id) return { success: false, reason: "missing_module_id" };
    if (!_getModuleDef(id)) return { success: false, reason: "module_not_found" };
    _setModuleEnabled(id, true);
    return { success: true, module_id: id, enabled: true };
  }

  function disable_module(args) {
    var id = args && args.module_id;
    if (!id) return { success: false, reason: "missing_module_id" };
    if (!_getModuleDef(id)) return { success: false, reason: "module_not_found" };
    _setModuleEnabled(id, false);
    return { success: true, module_id: id, enabled: false };
  }

  // 安全禁用：检查独占映射的活跃 Skill 依赖
  function safe_disable_module(args) {
    var id = args && args.module_id;
    if (!id) return { success: false, reason: "missing_module_id" };
    if (!_getModuleDef(id)) return { success: false, reason: "module_not_found" };

    _ensureState();
    var dependents = [];
    for (var skillId in runtime.state.skillMappings) {
      var mapping = runtime.state.skillMappings[skillId];
      if (mapping.moduleId === id && mapping.exclusive) {
        dependents.push(skillId);
      }
    }
    if (dependents.length > 0) {
      return {
        success: false,
        reason: "skill_dependent",
        module_id: id,
        dependents: dependents
      };
    }
    _setModuleEnabled(id, false);
    return { success: true, module_id: id, enabled: false };
  }

  function enable_all_modules() {
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    mods.forEach(function (m) { _setModuleEnabled(m.id, true); });
    runtime.state.customModules.forEach(function (m) { m.enabled = true; });
    return { success: true, enabledCount: mods.length + runtime.state.customModules.length };
  }

  function disable_all_modules() {
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    mods.forEach(function (m) { _setModuleEnabled(m.id, false); });
    runtime.state.customModules.forEach(function (m) { m.enabled = false; });
    return { success: true, disabledCount: mods.length + runtime.state.customModules.length };
  }

  function enable_category(args) {
    var category = args && args.category;
    if (!category) return { success: false, reason: "missing_category" };
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    var cnt = 0;
    mods.filter(function (m) { return m.category === category; }).forEach(function (m) {
      _setModuleEnabled(m.id, true);
      cnt++;
    });
    return { success: true, category: category, enabledCount: cnt };
  }

  function disable_category(args) {
    var category = args && args.category;
    if (!category) return { success: false, reason: "missing_category" };
    _ensureState();
    var mods = MODULES_DATA.modules || [];
    var cnt = 0;
    mods.filter(function (m) { return m.category === category; }).forEach(function (m) {
      _setModuleEnabled(m.id, false);
      cnt++;
    });
    return { success: true, category: category, disabledCount: cnt };
  }

  function add_custom_module(args) {
    var name = args && args.name;
    if (!name) return { success: false, reason: "missing_name" };
    _ensureState();
    var id = "custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    var mod = {
      id: id,
      name: name,
      description: args.description || "",
      category: "custom",
      index: 1000 + runtime.state.customModules.length,
      enabled: true
    };
    runtime.state.customModules.push(mod);
    return { success: true, module: mod };
  }

  function remove_custom_module(args) {
    var id = args && args.module_id;
    if (!id) return { success: false, reason: "missing_module_id" };
    _ensureState();
    var idx = -1;
    for (var i = 0; i < runtime.state.customModules.length; i++) {
      if (runtime.state.customModules[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return { success: false, reason: "module_not_found" };
    runtime.state.customModules.splice(idx, 1);
    delete runtime.state.modules[id];
    // 同时清理该模块的 Skill 映射
    for (var skillId in runtime.state.skillMappings) {
      if (runtime.state.skillMappings[skillId].moduleId === id) {
        delete runtime.state.skillMappings[skillId];
      }
    }
    return { success: true, module_id: id };
  }

  function get_module_info(args) {
    var id = args && args.module_id;
    if (!id) return { error: "missing_module_id" };
    var def = _getModuleDef(id);
    if (!def) return { error: "module_not_found" };
    _ensureState();
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      index: def.index,
      stage: def.stage,
      description: def.description,
      enabled: _isModuleEnabled(def.id),
      usageCount: runtime.state.moduleUsage[def.id] || 0,
      mergedFrom: def.mergedFrom || null,
      filename: def.filename || null,
      efficiency: (args._metrics && typeof args._metrics.getModuleEfficiency === "function")
        ? args._metrics.getModuleEfficiency(def.id) : undefined
    };
  }

  // 模块文档：返回内联元信息（QuickJS 无文件系统，完整文档由 main.js 通过 ToolPkg.readResource 读取）
  function get_module_doc(args) {
    var id = args && args.module_id;
    if (!id) return { error: "missing_module_id" };
    var def = _getModuleDef(id);
    if (!def) return { error: "module_not_found" };
    if (def.category === "custom") return { content: def.description || "(自定义模块无文档)" };
    return {
      module_id: id,
      filename: def.filename || (def.id + ".md"),
      description: def.description || "",
      content: def.description || ""
    };
  }

  // ============ Skill↔Module 映射 ============

  function map_skill_module(args) {
    var skillId = args && args.skillId;
    var moduleId = args && args.moduleId;
    var exclusive = !!(args && args.exclusive);
    if (!skillId) return { success: false, reason: "missing_skill_id" };
    if (!moduleId) return { success: false, reason: "missing_module_id" };
    if (!_getModuleDef(moduleId)) return { success: false, reason: "module_not_found" };
    _ensureState();
    runtime.state.skillMappings[skillId] = {
      skillId: skillId,
      moduleId: moduleId,
      exclusive: exclusive,
      createdAt: Date.now()
    };
    return { success: true, mapping: runtime.state.skillMappings[skillId] };
  }

  function unmap_skill_module(args) {
    var skillId = args && args.skillId;
    if (!skillId) return { success: false, reason: "missing_skill_id" };
    _ensureState();
    if (!runtime.state.skillMappings[skillId]) {
      return { success: false, reason: "mapping_not_found" };
    }
    delete runtime.state.skillMappings[skillId];
    return { success: true, skillId: skillId };
  }

  function get_skill_mapping(args) {
    _ensureState();
    if (args && args.skillId) {
      var m = runtime.state.skillMappings[args.skillId];
      return m ? { mapping: m } : { mapping: null };
    }
    if (args && args.moduleId) {
      var dependents = [];
      for (var sid in runtime.state.skillMappings) {
        if (runtime.state.skillMappings[sid].moduleId === args.moduleId) {
          dependents.push(runtime.state.skillMappings[sid]);
        }
      }
      return { mappings: dependents };
    }
    return { mappings: runtime.state.skillMappings };
  }

  // ============ 辅助 ============

  function incrementUsage(moduleId) {
    _ensureState();
    runtime.state.moduleUsage[moduleId] = (runtime.state.moduleUsage[moduleId] || 0) + 1;
  }

  function disableLowEfficiencyModule(stageId, metricsObj) {
    _ensureState();
    var mods = getModulesByStage(stageId);
    if (!mods || mods.length === 0) return null;
    // 找效率最低的启用模块
    var lowest = null, lowestEff = Infinity;
    for (var i = 0; i < mods.length; i++) {
      if (!_isModuleEnabled(mods[i].id)) continue;
      var eff = 100;
      if (metricsObj && typeof metricsObj.getModuleEfficiency === "function") {
        try { eff = metricsObj.getModuleEfficiency(mods[i].id); } catch (e) { eff = 100; }
      }
      if (eff < lowestEff) { lowestEff = eff; lowest = mods[i]; }
    }
    if (lowest) {
      _setModuleEnabled(lowest.id, false);
      return { disabledModuleId: lowest.id, efficiency: lowestEff };
    }
    return null;
  }

  function _reset() {
    runtime.state = null;
  }

  // 测试用：注入模块数据（不读文件）
  function _injectModulesData(data) {
    MODULES_DATA = data;
  }

  exports.CATEGORY_NAMES = CATEGORY_NAMES;
  exports._setRuntime = _setRuntime;
  exports._reset = _reset;
  exports._injectModulesData = _injectModulesData;
  exports.getModulesByStage = getModulesByStage;
  exports.incrementUsage = incrementUsage;
  exports.disableLowEfficiencyModule = disableLowEfficiencyModule;
  // 工具函数（旧名保留）
  exports.list_modules = list_modules;
  exports.enable_module = enable_module;
  exports.disable_module = disable_module;
  exports.safe_disable_module = safe_disable_module;
  exports.enable_all_modules = enable_all_modules;
  exports.disable_all_modules = disable_all_modules;
  exports.enable_category = enable_category;
  exports.disable_category = disable_category;
  exports.add_custom_module = add_custom_module;
  exports.remove_custom_module = remove_custom_module;
  exports.get_module_info = get_module_info;
  exports.get_module_doc = get_module_doc;
  // Skill 映射
  exports.map_skill_module = map_skill_module;
  exports.unmap_skill_module = unmap_skill_module;
  exports.get_skill_mapping = get_skill_mapping;
})();
