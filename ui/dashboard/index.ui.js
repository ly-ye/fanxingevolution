/*
 * 繁星·自进化内核 - 仪表盘 UI (Compose DSL)
 * 导出 default async screen function，通过 ToolPkg.ipc.call 获取数据
 * 创作者：夜
 */

(function () {
  "use strict";

  // 繁星主题配色
  var THEME = {
    primary: "#6366F1",
    primaryDark: "#4F46E5",
    accent: "#F59E0B",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    bg: "#0F172A",
    surface: "#1E293B",
    surfaceLight: "#334155",
    textPrimary: "#F8FAFC",
    textSecondary: "#94A3B8",
    textMuted: "#64748B"
  };

  function _ipcCall(name, payload) {
    var ToolPkg = (typeof globalThis !== "undefined" && globalThis.ToolPkg) || null;
    if (ToolPkg && ToolPkg.ipc && typeof ToolPkg.ipc.call === "function") {
      return ToolPkg.ipc.call(name, payload || {});
    }
    return Promise.resolve({ error: "ipc_unavailable" });
  }

  function _statCard(label, value, color) {
    return {
      type: "Card",
      modifiers: { backgroundColor: THEME.surface, borderRadius: 12, elevation: 1, flex: 1, margin: { right: 4, left: 4 } },
      child: {
        type: "Column",
        modifiers: { padding: 12, crossAxisAlignment: "center" },
        children: [
          { type: "Text", text: label, style: { fontSize: 11, color: THEME.textSecondary } },
          { type: "Text", text: value, style: { fontSize: 18, fontWeight: "bold", color: color } }
        ]
      }
    };
  }

  function _trendBars(trend) {
    var stageNames = ["感知", "记忆", "思考", "行动", "反思", "进化", "基础设施", "安全"];
    return (trend || []).map(function (eff, i) {
      var pct = Math.min(100, Math.max(0, eff));
      return {
        type: "Row",
        modifiers: { mainAxisAlignment: "spaceBetween", padding: { top: 4, bottom: 4 } },
        children: [
          { type: "Text", text: stageNames[i] || ("S" + i), style: { fontSize: 12, color: THEME.textSecondary, width: 60 } },
          { type: "Container", modifiers: { height: 8, width: 200, backgroundColor: THEME.surfaceLight, borderRadius: 4 }, child: {
            type: "Container", modifiers: { height: 8, width: Math.round(pct * 2), backgroundColor: THEME.primary, borderRadius: 4 }
          }},
          { type: "Text", text: Math.round(eff || 0) + "", style: { fontSize: 12, color: THEME.textPrimary, width: 40 } }
        ]
      };
    });
  }

  // ============ 主 screen（async，Compose DSL 约定）============

  async function screen(ctx) {
    ctx = ctx || {};
    var params = ctx.params || {};

    // 并发拉取数据
    var state = {}, modulesResult = { modules: [] }, logsResult = { logs: [] }, stabilitySignal = {};
    try { state = await _ipcCall("sea.get_state"); } catch (e) { state = {}; }
    try { modulesResult = await _ipcCall("sea.list_modules", { category: "all" }); } catch (e) { modulesResult = { modules: [] }; }
    try { logsResult = await _ipcCall("sea.get_evolution_log", { limit: 20 }); } catch (e) { logsResult = { logs: [] }; }
    try { stabilitySignal = await _ipcCall("sea.get_stability_signal"); } catch (e) { stabilitySignal = {}; }

    var driftColor = state.evolutionDrift ? THEME.danger : THEME.success;
    var driftText = state.evolutionDrift ? "漂移" : "稳定";
    var bloatPct = Math.round((state.moduleBloat || 0) * 100);
    var bloatColor = bloatPct > 70 ? THEME.danger : (bloatPct > 50 ? THEME.warning : THEME.success);
    var runText = state.isRunning ? "运行中" : "已停止";
    var runColor = state.isRunning ? THEME.success : THEME.textMuted;

    // 模块分组
    var catLabels = { perception: "感知", memory: "记忆", thinking: "思考", action: "行动", reflection: "反思", evolution: "进化", infrastructure: "基础设施", security: "安全扩展", custom: "自定义" };
    var catOrder = ["perception", "memory", "thinking", "action", "reflection", "evolution", "infrastructure", "security", "custom"];
    var categories = {};
    (modulesResult.modules || []).forEach(function (m) {
      if (!categories[m.category]) categories[m.category] = [];
      categories[m.category].push(m);
    });

    var moduleSections = [];
    catOrder.forEach(function (cat) {
      if (!categories[cat] || categories[cat].length === 0) return;
      var switches = categories[cat].map(function (m) {
        return {
          type: "Row",
          modifiers: { mainAxisAlignment: "spaceBetween", padding: { top: 8, bottom: 8 } },
          children: [
            { type: "Column", children: [
              { type: "Text", text: m.name, style: { fontSize: 14, color: THEME.textPrimary } },
              { type: "Text", text: m.id, style: { fontSize: 11, color: THEME.textMuted } }
            ]},
            {
              type: "Switch",
              value: m.enabled,
              onChange: "sea.toggle_module",
              onChangePayload: { module_id: m.id }
            }
          ]
        };
      });
      moduleSections.push({
        type: "Card",
        modifiers: { margin: { bottom: 12 }, backgroundColor: THEME.surface, borderRadius: 12 },
        child: {
          type: "Column",
          modifiers: { padding: 16 },
          children: [{ type: "Text", text: catLabels[cat] || cat, style: { fontSize: 15, fontWeight: "bold", color: THEME.primary, padding: { bottom: 8 } } }].concat(switches)
        }
      });
    });

    // 日志项
    var logs = (logsResult.logs || []).slice(0, 15);
    var logItems = logs.map(function (l) {
      var typeColor = THEME.textSecondary;
      if (l.type === "endure_gate" || l.type === "law_violation" || l.type === "error") typeColor = THEME.danger;
      else if (l.type === "excel_gate" || l.type === "paradigm_suggestion") typeColor = THEME.accent;
      else if (l.type === "cycle_end") typeColor = THEME.success;
      else if (l.type === "system") typeColor = THEME.primary;
      return {
        type: "Card",
        modifiers: { margin: { bottom: 8 }, backgroundColor: THEME.surface, borderRadius: 8 },
        child: {
          type: "Column",
          modifiers: { padding: 12 },
          children: [
            { type: "Row", modifiers: { mainAxisAlignment: "spaceBetween" }, children: [
              { type: "Text", text: "[" + l.type + "]", style: { fontSize: 11, color: typeColor, fontFamily: "monospace" } },
              { type: "Text", text: "G" + l.generation, style: { fontSize: 11, color: THEME.textMuted } }
            ]},
            { type: "Text", text: l.message, style: { fontSize: 13, color: THEME.textPrimary, padding: { top: 4 } } }
          ]
        }
      };
    });

    return {
      type: "Column",
      modifiers: { padding: 16, backgroundColor: THEME.bg },
      children: [
        // 标题栏
        {
          type: "Row",
          modifiers: { mainAxisAlignment: "spaceBetween", padding: { bottom: 16 } },
          children: [
            { type: "Text", text: "繁星·自进化内核", style: { fontSize: 22, fontWeight: "bold", color: THEME.textPrimary } },
            { type: "Container", modifiers: { padding: { left: 8, right: 8, top: 4, bottom: 4 }, borderRadius: 12, backgroundColor: runColor }, child: { type: "Text", text: runText, style: { fontSize: 12, color: "#FFFFFF" } } }
          ]
        },
        // 状态卡
        {
          type: "Card",
          modifiers: { margin: { bottom: 12 }, backgroundColor: THEME.surface, borderRadius: 12, elevation: 2 },
          child: {
            type: "Column",
            modifiers: { padding: 16 },
            children: [
              { type: "Text", text: "第 " + (state.generation || 0) + " 代", style: { fontSize: 28, fontWeight: "bold", color: THEME.primary } },
              { type: "Row", modifiers: { mainAxisAlignment: "spaceBetween", padding: { top: 8 } }, children: [
                { type: "Text", text: "进化模式", style: { fontSize: 13, color: THEME.textSecondary } },
                { type: "Text", text: state.evolutionMode || "standard", style: { fontSize: 13, color: THEME.textPrimary } }
              ]},
              { type: "Row", modifiers: { mainAxisAlignment: "spaceBetween", padding: { top: 4 } }, children: [
                { type: "Text", text: "知识增长", style: { fontSize: 13, color: THEME.textSecondary } },
                { type: "Text", text: String((state.knowledgeGrowth || 0).toFixed(2)), style: { fontSize: 13, color: THEME.accent } }
              ]}
            ]
          }
        },
        // 三指标
        {
          type: "Row",
          modifiers: { mainAxisAlignment: "spaceBetween", padding: { bottom: 12 } },
          children: [
            _statCard("进化漂移", driftText, driftColor),
            _statCard("模块膨胀", bloatPct + "%", bloatColor),
            _statCard("启用模块", (state.totalEnabledModules || 0) + "/" + (state.moduleUpperLimit || 48), THEME.primary)
          ]
        },
        // 操作按钮
        {
          type: "Row",
          modifiers: { mainAxisAlignment: "spaceBetween", padding: { bottom: 16 } },
          children: [
            {
              type: "Button",
              text: state.isRunning ? "停止" : "启动",
              modifiers: { backgroundColor: state.isRunning ? THEME.danger : THEME.success, borderRadius: 8, padding: { left: 24, right: 24, top: 12, bottom: 12 } },
              onClick: "sea.toggle_system"
            },
            {
              type: "Button",
              text: "手动触发",
              modifiers: { backgroundColor: THEME.primary, borderRadius: 8, padding: { left: 24, right: 24, top: 12, bottom: 12 } },
              onClick: "sea.trigger_evolution"
            }
          ]
        },
        // 稳定性信号
        {
          type: "Card",
          modifiers: { margin: { bottom: 12 }, backgroundColor: THEME.surface, borderRadius: 12 },
          child: { type: "Column", modifiers: { padding: 16 }, children: [
            { type: "Text", text: "稳定性信号", style: { fontSize: 16, fontWeight: "bold", color: THEME.textPrimary, padding: { bottom: 8 } } },
            { type: "Row", modifiers: { mainAxisAlignment: "spaceBetween" }, children: [
              { type: "Text", text: "进化漂移", style: { fontSize: 14, color: THEME.textSecondary } },
              { type: "Text", text: stabilitySignal.evolutionDrift ? "是" : "否", style: { fontSize: 16, fontWeight: "bold", color: driftColor } }
            ]},
            { type: "Row", modifiers: { mainAxisAlignment: "spaceBetween", padding: { top: 8 } }, children: [
              { type: "Text", text: "漂移代数", style: { fontSize: 14, color: THEME.textSecondary } },
              { type: "Text", text: String(stabilitySignal.driftGenerations || 0), style: { fontSize: 16, color: THEME.textPrimary } }
            ]}
          ]}
        },
        // 阶段效率趋势
        { type: "Text", text: "阶段效率趋势", style: { fontSize: 15, fontWeight: "bold", color: THEME.primary, padding: { top: 4, bottom: 8 } } }
      ].concat(_trendBars(stabilitySignal.efficiencyTrend))
       .concat([{ type: "Text", text: "模块管理", style: { fontSize: 16, fontWeight: "bold", color: THEME.textPrimary, padding: { top: 16, bottom: 8 } } }])
       .concat(moduleSections)
       .concat([{ type: "Text", text: "进化日志", style: { fontSize: 16, fontWeight: "bold", color: THEME.textPrimary, padding: { top: 16, bottom: 8 } } }])
       .concat(logItems.length > 0 ? logItems : [{ type: "Text", text: "暂无日志", style: { color: THEME.textMuted, padding: { top: 8 } } }])
    };
  }

  // Compose DSL 约定：导出 default screen function
  exports.default = screen;
  // 供测试直接调用
  exports.screen = screen;
  exports.THEME = THEME;
})();
