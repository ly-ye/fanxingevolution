# 繁星·诊断系统（diagnostics）

## 概述

繁星的诊断系统整合自性能优化与日志分析，是繁星自我体检的全科医生。它持续采集性能指标与运行日志，检测瓶颈与异常，自动生成优化建议，让繁星在自进化的道路上始终保持健康的体魄。

繁星相信，看不见的问题才是最危险的问题。诊断系统通过日志模式识别与趋势分析，在异常演变为故障之前就发出预警；通过性能瓶颈定位与自动优化，让繁星的每一次行动都更加高效。日志与性能，互为表里，共同构成繁星的自我认知。

## 功能特性

- **性能分析**：采集并分析 CPU、内存、耗时等性能指标。
- **瓶颈检测**：识别性能热点与资源瓶颈。
- **自动优化**：依据瓶颈分析自动生成优化建议与参数调整。
- **异常检测**：基于统计与规则检测指标异常与行为异常。
- **日志收集**：统一收集多来源日志，支持结构化与全文检索。
- **模式识别**：从日志中识别重复出现的模式与异常簇。
- **趋势分析**：分析指标与日志模式的时间趋势，提前预警。

## 接口说明

```python
class Diagnostics:
    def __init__(self) -> None
    # 初始化诊断系统

    def collect_metric(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None
    # 参数：name 指标名；value 数值；tags 标签
    # 返回：无

    def collect_log(self, level: str, source: str, message: str, meta: Optional[Dict] = None) -> None
    # 参数：level 日志级别；source 来源；message 内容；meta 元数据
    # 返回：无

    def analyze_performance(self, window: int = 100) -> Dict[str, Any]
    # 参数：window 分析窗口大小
    # 返回：性能分析报告

    def detect_bottleneck(self) -> List[Dict[str, Any]]
    # 返回：瓶颈列表（指标、位置、严重度）

    def auto_optimize(self, bottlenecks: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]
    # 参数：bottlenecks 瓶颈列表，None则自动检测
    # 返回：优化建议列表

    def detect_anomaly(self, metric: Optional[str] = None) -> Dict[str, Any]
    # 参数：metric 指定指标，None检测全部
    # 返回：异常检测结果

    def recognize_log_patterns(self) -> Dict[str, Any]
    # 返回：日志模式识别结果

    def trend_analysis(self, metric: str, window: int = 50) -> Dict[str, Any]
    # 参数：metric 指标名；window 分析窗口
    # 返回：趋势分析结果

    def diagnose(self) -> Dict[str, Any]
    # 返回：完整诊断报告
```

## 与其他模块的联动

- 与 **task_orchestration** 联动：工作流执行耗时与异常上报诊断系统。
- 与 **device_automation** 联动：自动化动作的延迟与失败率作为指标源。
- 与 **error_learning** 联动：诊断发现的异常同步错误学习器分析根因。
- 与 **reflection** 联动：诊断报告作为反思输入用于策略优化。
- 与 **tool_extender** 联动：工具性能画像作为指标源接入。

## 完整实现代码

```python
"""
繁星·诊断系统模块
整合自性能优化与日志分析：性能分析、瓶颈检测、自动优化、异常检测、日志收集/模式识别/趋势分析
创作者：夜
"""
from __future__ import annotations

import re
import statistics
import time
import uuid
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple


@dataclass
class MetricPoint:
    """指标数据点"""
    name: str
    value: float
    tags: Dict[str, str]
    timestamp: float = field(default_factory=time.time)


@dataclass
class LogEntry:
    """日志条目"""
    level: str  # DEBUG / INFO / WARN / ERROR / FATAL
    source: str
    message: str
    meta: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)


class Diagnostics:
    """繁星诊断系统"""

    # 异常检测阈值
    ANOMALY_ZSCORE_THRESHOLD = 2.5
    # 瓶颈阈值
    BOTTLENECK_LATENCY_MS = 1000
    BOTTLENECK_CPU_PCT = 80
    BOTTLENECK_MEM_PCT = 85

    def __init__(self) -> None:
        self.metrics: Dict[str, Deque[MetricPoint]] = defaultdict(lambda: deque(maxlen=1000))
        self.logs: Deque[LogEntry] = deque(maxlen=2000)
        self.reports: List[Dict[str, Any]] = []

    # ---------- 数据采集 ----------
    def collect_metric(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        self.metrics[name].append(MetricPoint(name, value, tags or {}))

    def collect_log(self, level: str, source: str, message: str, meta: Optional[Dict] = None) -> None:
        self.logs.append(LogEntry(level, source, message, meta or {}))

    # ---------- 性能分析 ----------
    def analyze_performance(self, window: int = 100) -> Dict[str, Any]:
        report: Dict[str, Any] = {"metrics": {}, "summary": {}}
        all_latencies = []
        for name, points in self.metrics.items():
            recent = list(points)[-window:]
            if not recent:
                continue
            values = [p.value for p in recent]
            stats = {
                "count": len(values),
                "mean": round(statistics.mean(values), 2),
                "median": round(statistics.median(values), 2),
                "stdev": round(statistics.stdev(values), 2) if len(values) > 1 else 0,
                "min": min(values),
                "max": max(values),
                "p95": self._percentile(values, 95),
                "p99": self._percentile(values, 99),
            }
            report["metrics"][name] = stats
            if "latency" in name.lower():
                all_latencies.extend(values)
        if all_latencies:
            report["summary"]["avg_latency"] = round(statistics.mean(all_latencies), 2)
            report["summary"]["p99_latency"] = self._percentile(all_latencies, 99)
        report["summary"]["metric_count"] = len(report["metrics"])
        return report

    def _percentile(self, values: List[float], p: float) -> float:
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        idx = int(len(sorted_vals) * p / 100)
        idx = min(idx, len(sorted_vals) - 1)
        return round(sorted_vals[idx], 2)

    # ---------- 瓶颈检测 ----------
    def detect_bottleneck(self) -> List[Dict[str, Any]]:
        bottlenecks = []
        for name, points in self.metrics.items():
            recent = list(points)[-100:]
            if not recent:
                continue
            values = [p.value for p in recent]
            avg = statistics.mean(values)
            # 延迟瓶颈
            if "latency" in name.lower() and avg > self.BOTTLENECK_LATENCY_MS:
                bottlenecks.append({
                    "metric": name, "type": "latency",
                    "value": round(avg, 2), "threshold": self.BOTTLENECK_LATENCY_MS,
                    "severity": "high" if avg > self.BOTTLENECK_LATENCY_MS * 2 else "medium",
                })
            # CPU瓶颈
            if "cpu" in name.lower() and avg > self.BOTTLENECK_CPU_PCT:
                bottlenecks.append({
                    "metric": name, "type": "cpu",
                    "value": round(avg, 2), "threshold": self.BOTTLENECK_CPU_PCT,
                    "severity": "high" if avg > 95 else "medium",
                })
            # 内存瓶颈
            if "memory" in name.lower() and avg > self.BOTTLENECK_MEM_PCT:
                bottlenecks.append({
                    "metric": name, "type": "memory",
                    "value": round(avg, 2), "threshold": self.BOTTLENECK_MEM_PCT,
                    "severity": "high" if avg > 95 else "medium",
                })
            # 错误率瓶颈
            if "error_rate" in name.lower() and avg > 5:
                bottlenecks.append({
                    "metric": name, "type": "error_rate",
                    "value": round(avg, 2), "threshold": 5,
                    "severity": "high" if avg > 10 else "medium",
                })
        return bottlenecks

    # ---------- 自动优化 ----------
    def auto_optimize(self, bottlenecks: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        bns = bottlenecks if bottlenecks is not None else self.detect_bottleneck()
        suggestions = []
        for bn in bns:
            btype = bn["type"]
            if btype == "latency":
                suggestions.append({
                    "target": bn["metric"],
                    "action": "增加缓存、减少IO、异步化处理",
                    "priority": bn["severity"],
                    "expected_gain": "延迟降低30-50%",
                })
            elif btype == "cpu":
                suggestions.append({
                    "target": bn["metric"],
                    "action": "优化算法复杂度、增加并行度、限流降载",
                    "priority": bn["severity"],
                    "expected_gain": "CPU使用率降低15-25%",
                })
            elif btype == "memory":
                suggestions.append({
                    "target": bn["metric"],
                    "action": "释放无用对象、增加分页、优化数据结构",
                    "priority": bn["severity"],
                    "expected_gain": "内存占用降低20-30%",
                })
            elif btype == "error_rate":
                suggestions.append({
                    "target": bn["metric"],
                    "action": "增加重试、熔断降级、排查根因",
                    "priority": bn["severity"],
                    "expected_gain": "错误率降低至1%以下",
                })
        return suggestions

    # ---------- 异常检测 ----------
    def detect_anomaly(self, metric: Optional[str] = None) -> Dict[str, Any]:
        targets = [metric] if metric else list(self.metrics.keys())
        anomalies = []
        for name in targets:
            points = list(self.metrics.get(name, []))[-100:]
            if len(points) < 10:
                continue
            values = [p.value for p in points]
            mean = statistics.mean(values)
            stdev = statistics.stdev(values) if len(values) > 1 else 0
            if stdev == 0:
                continue
            # 检查最近的点是否异常
            recent_values = values[-5:]
            for i, v in enumerate(recent_values):
                z_score = abs(v - mean) / stdev
                if z_score > self.ANOMALY_ZSCORE_THRESHOLD:
                    anomalies.append({
                        "metric": name,
                        "value": v,
                        "expected_range": [round(mean - 2 * stdev, 2), round(mean + 2 * stdev, 2)],
                        "z_score": round(z_score, 2),
                        "position": f"最近第{len(recent_values) - i}个点",
                    })
        # 日志异常：ERROR/FATAL突增
        error_count = sum(1 for l in list(self.logs)[-100:] if l.level in ("ERROR", "FATAL"))
        if error_count > 10:
            anomalies.append({
                "metric": "log_error_count",
                "value": error_count,
                "expected_range": [0, 10],
                "z_score": 3.0,
                "position": "最近100条日志",
            })
        return {
            "anomaly_count": len(anomalies),
            "anomalies": anomalies,
            "monitored_metrics": len(targets),
        }

    # ---------- 日志模式识别 ----------
    def recognize_log_patterns(self) -> Dict[str, Any]:
        recent_logs = list(self.logs)[-500:]
        if not recent_logs:
            return {"patterns": [], "total_logs": 0}
        # 按级别统计
        level_counts = Counter(l.level for l in recent_logs)
        # 按来源统计
        source_counts = Counter(l.source for l in recent_logs)
        # 消息模板提取（简化：去数字后聚类）
        templates: Dict[str, int] = Counter()
        for log in recent_logs:
            template = re.sub(r"\d+", "*", log.message)
            template = re.sub(r"['\"].*?['\"]", "'*'", template)
            templates[template] += 1
        # 高频模板
        frequent = [{"template": t, "count": c} for t, c in templates.most_common(10) if c >= 2]
        # 异常模板（ERROR且高频）
        error_templates = [
            {"template": t, "count": c}
            for t, c in templates.most_common(20)
            if c >= 2 and any(
                re.sub(r"\d+", "*", l.message) == t and l.level == "ERROR"
                for l in recent_logs
            )
        ]
        return {
            "total_logs": len(recent_logs),
            "level_distribution": dict(level_counts),
            "source_distribution": dict(source_counts.most_common(5)),
            "frequent_patterns": frequent,
            "error_patterns": error_templates[:5],
        }

    # ---------- 趋势分析 ----------
    def trend_analysis(self, metric: str, window: int = 50) -> Dict[str, Any]:
        points = list(self.metrics.get(metric, []))[-window:]
        if len(points) < 2:
            return {"metric": metric, "error": "数据不足"}
        values = [p.value for p in points]
        n = len(values)
        x_mean = (n - 1) / 2
        y_mean = statistics.mean(values)
        numerator = sum((i - x_mean) * (values[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0
        # 趋势判定
        if slope > 0.1:
            trend = "上升"
        elif slope < -0.1:
            trend = "下降"
        else:
            trend = "平稳"
        # 波动性
        stdev = statistics.stdev(values) if len(values) > 1 else 0
        cv = stdev / max(abs(y_mean), 1)  # 变异系数
        volatility = "高" if cv > 0.3 else "中" if cv > 0.1 else "低"
        return {
            "metric": metric,
            "trend": trend,
            "slope": round(slope, 4),
            "current": values[-1],
            "mean": round(y_mean, 2),
            "volatility": volatility,
            "cv": round(cv, 4),
            "data_points": n,
        }

    # ---------- 完整诊断 ----------
    def diagnose(self) -> Dict[str, Any]:
        perf = self.analyze_performance()
        bottlenecks = self.detect_bottleneck()
        optimizations = self.auto_optimize(bottlenecks)
        anomalies = self.detect_anomaly()
        log_patterns = self.recognize_log_patterns()
        # 关键指标趋势
        trends = {}
        for name in list(self.metrics.keys())[:5]:
            trends[name] = self.trend_analysis(name)
        report = {
            "diagnosis_id": uuid.uuid4().hex[:8],
            "timestamp": time.time(),
            "performance": perf,
            "bottlenecks": bottlenecks,
            "optimizations": optimizations,
            "anomalies": anomalies,
            "log_patterns": log_patterns,
            "trends": trends,
            "health_score": self._health_score(perf, bottlenecks, anomalies),
        }
        self.reports.append(report)
        return report

    def _health_score(self, perf: Dict, bottlenecks: List, anomalies: Dict) -> float:
        """计算健康分0-100"""
        score = 100.0
        score -= len(bottlenecks) * 10
        score -= anomalies.get("anomaly_count", 0) * 5
        # 日志错误率影响
        log_dist = perf.get("summary", {})
        if "avg_latency" in log_dist and log_dist["avg_latency"] > self.BOTTLENECK_LATENCY_MS:
            score -= 10
        return max(0.0, min(100.0, round(score, 1)))


# ---------- 简单测试 ----------
if __name__ == "__main__":
    diag = Diagnostics()

    # 1. 采集指标
    import random
    for i in range(50):
        diag.collect_metric("api_latency", random.gauss(200, 50))
        diag.collect_metric("cpu_usage", random.gauss(60, 10))
        diag.collect_metric("memory_usage", random.gauss(70, 8))
    # 注入异常
    diag.collect_metric("api_latency", 2500)
    diag.collect_metric("cpu_usage", 95)

    # 2. 采集日志
    for i in range(30):
        diag.collect_log("INFO", "api", f"请求处理完成 耗时{random.randint(100, 300)}ms")
    for i in range(5):
        diag.collect_log("ERROR", "api", f"连接超时 timeout after {random.randint(30, 60)}s")
    diag.collect_log("FATAL", "db", "数据库连接池耗尽")

    # 3. 性能分析
    perf = diag.analyze_performance()
    print("指标数:", perf["summary"]["metric_count"])

    # 4. 瓶颈检测
    bns = diag.detect_bottleneck()
    print(f"检测到 {len(bns)} 个瓶颈")
    for bn in bns[:2]:
        print("  ", bn["type"], bn["value"])

    # 5. 自动优化
    opts = diag.auto_optimize()
    print(f"生成 {len(opts)} 条优化建议")

    # 6. 异常检测
    anomalies = diag.detect_anomaly()
    print("异常数:", anomalies["anomaly_count"])

    # 7. 日志模式
    patterns = diag.recognize_log_patterns()
    print("日志模式数:", len(patterns["frequent_patterns"]))
    print("级别分布:", patterns["level_distribution"])

    # 8. 趋势分析
    trend = diag.trend_analysis("api_latency")
    print("趋势:", trend["trend"], "波动:", trend["volatility"])

    # 9. 完整诊断
    report = diag.diagnose()
    print("健康分:", report["health_score"])
```
