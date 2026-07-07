/*
 * 繁星·自进化内核 - 事件总线
 * 接收繁星 push 的真实事件，环形缓冲，供进化循环消化
 * 创作者：夜
 */

(function () {
  "use strict";

  var CAPACITY = 1000;
  var buffer = [];
  var head = 0; // 下一个写入位置
  var count = 0; // 当前元素数
  var lastDrainedTimestamp = 0;
  var seqCounter = 0; // 单调递增序号，避免同毫秒事件冲突
  var lastDrainedSeq = 0;
  var stats = {
    accepted: 0,
    rejected: 0,
    overflowed: 0,
    byType: {
      task_result: 0,
      skill_update: 0,
      error_path: 0,
      module_toggle: 0
    }
  };

  // 事件类型校验规则
  var VALIDATORS = {
    task_result: function (e) {
      return typeof e.success === "boolean" &&
        Array.isArray(e.modulesUsed) &&
        typeof e.durationMs === "number" &&
        typeof e.complexity === "number";
    },
    skill_update: function (e) {
      return typeof e.skillId === "string" && e.skillId.length > 0 &&
        (e.moduleId === undefined || typeof e.moduleId === "string") &&
        (typeof e.delta === "number" || typeof e.success === "number" || typeof e.failure === "number");
    },
    error_path: function (e) {
      return typeof e.errorType === "string" &&
        (e.moduleId === undefined || typeof e.moduleId === "string") &&
        (e.recovered === undefined || typeof e.recovered === "boolean");
    },
    module_toggle: function (e) {
      return typeof e.moduleId === "string" && e.moduleId.length > 0 &&
        typeof e.enabled === "boolean";
    }
  };

  function validate(event) {
    if (!event || typeof event !== "object") return { valid: false, reason: "not_object" };
    if (!event.type || !VALIDATORS[event.type]) return { valid: false, reason: "invalid_type" };
    if (!VALIDATORS[event.type](event)) return { valid: false, reason: "invalid_fields" };
    return { valid: true };
  }

  function submit(event) {
    var v = validate(event);
    if (!v.valid) {
      stats.rejected++;
      return { success: false, reason: v.reason };
    }

    var entry = {
      seq: ++seqCounter,
      timestamp: Date.now(),
      type: event.type,
      payload: event
    };

    if (count >= CAPACITY) {
      // 环形缓冲满，丢弃最旧
      buffer[head] = entry;
      head = (head + 1) % CAPACITY;
      stats.overflowed++;
    } else {
      buffer[head] = entry;
      head = (head + 1) % CAPACITY;
      count++;
    }

    stats.accepted++;
    if (stats.byType[event.type] !== undefined) {
      stats.byType[event.type]++;
    }
    return { success: true, timestamp: entry.timestamp };
  }

  function drain(sinceSeq) {
    // sinceSeq 是上次 drain 的最大 seq，返回 seq > sinceSeq 的事件
    var since = sinceSeq || 0;
    var result = [];
    for (var i = 0; i < count; i++) {
      var idx = (head - count + i + CAPACITY) % CAPACITY;
      var entry = buffer[idx];
      if (entry && entry.seq > since) {
        result.push(entry);
      }
    }
    if (result.length > 0) {
      lastDrainedSeq = result[result.length - 1].seq;
      lastDrainedTimestamp = result[result.length - 1].timestamp;
    }
    return result;
  }

  function size() {
    return count;
  }

  function clear() {
    buffer = [];
    head = 0;
    count = 0;
    lastDrainedTimestamp = 0;
  }

  function getStats() {
    return {
      capacity: CAPACITY,
      currentSize: count,
      accepted: stats.accepted,
      rejected: stats.rejected,
      overflowed: stats.overflowed,
      byType: Object.assign({}, stats.byType),
      lastDrainedTimestamp: lastDrainedTimestamp,
      lastDrainedSeq: lastDrainedSeq,
      nextSeq: seqCounter + 1
    };
  }

  // 测试用：重置全部状态
  function _reset() {
    clear();
    seqCounter = 0;
    lastDrainedSeq = 0;
    stats = {
      accepted: 0,
      rejected: 0,
      overflowed: 0,
      byType: { task_result: 0, skill_update: 0, error_path: 0, module_toggle: 0 }
    };
  }

  // 测试用：调小容量
  function _setCapacity(n) {
    CAPACITY = n;
    clear();
  }

  exports.submit = submit;
  exports.drain = drain;
  exports.size = size;
  exports.clear = clear;
  exports.getStats = getStats;
  exports.validate = validate;
  exports._reset = _reset;
  exports._setCapacity = _setCapacity;
})();
