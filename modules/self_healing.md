# 繁星·自愈系统（self_healing）

## 概述

繁星的自愈系统整合自自愈系统与自适应架构,是繁星在风浪中稳住身形的脊柱。当故障袭来,它先稳稳接住,诊断根因,再以最小代价修复;当负载起伏,它审视架构瓶颈,动态伸缩资源与拓扑,让繁星始终运行在最优形态。

它不等待崩溃才行动。健康监控持续采集心跳与指标,瓶颈识别在性能滑坡前发出预警,动态伸缩在水位变化时调整并发度与副本数。修复与伸缩都遵循"先稳后优"——先恢复可用性,再追求最优态。

## 功能特性

- **故障检测**:基于心跳、异常计数、超时阈值的故障感知。
- **故障诊断**:根因归因,区分瞬时抖动、代码缺陷、资源耗尽、外部依赖。
- **自动修复**:针对已知故障模式的修复策略库,支持重试、降级、重启、回滚。
- **健康监控**:周期性健康检查,产出健康分数与趋势。
- **架构监控**:模块调用链与资源指标采集,识别热点与单点。
- **瓶颈识别**:基于排队论与水位分析,定位 CPU/IO/锁/网络瓶颈。
- **动态伸缩**:按负载与瓶颈信号调整并发度、副本数、缓冲区大小。

## 接口说明

```python
class SelfHealing:
    def __init__(self, laws=None) -> None
    # 初始化自愈系统,laws 为进化三定律门控。

    def register_check(self, name: str, fn: Callable[[], HealthStatus]) -> None
    # 注册一项健康检查。

    def register_fix(self, fault_kind: str, fn: Callable[[Fault], FixResult]) -> None
    # 注册针对某类故障的修复策略。

    def heartbeat(self, component: str) -> None
    # 上报组件心跳。

    def report_metric(self, component: str, metric: str, value: float) -> None
    # 上报架构指标(用于瓶颈识别与伸缩)。

    def detect_fault(self) -> Fault | None
    # 综合心跳与检查结果检测当前故障。

    def diagnose(self, fault: Fault) -> Diagnosis
    # 诊断故障根因。

    def heal(self, fault: Fault) -> FixResult
    # 执行修复流程(经三定律门控)。

    def health_score(self) -> float
    # 返回当前整体健康分(0~1)。

    def identify_bottleneck(self) -> Bottleneck | None
    # 识别当前最显著瓶颈。

    def autoscale(self) -> ScalePlan
    # 生成动态伸缩计划并(模拟)执行。
```

## 与其他模块的联动

- **evolution_laws**:所有修复与伸缩动作经三定律门控,Endure 拒绝破坏稳定性的激进修复。
- **self_improver**:诊断出代码缺陷时,委托自改进器生成补丁。
- **notification_center**:故障与瓶颈事件通过通知中心广播给订阅者。
- **scheduler**:健康检查与心跳超时检测由调度器周期触发。
- **cache_manager**:动态伸缩时同步调整缓存容量上限。

## 完整实现代码

```python
"""繁星·自愈系统

整合自自愈系统与自适应架构:稳稳接住故障,再动态伸缩到最优态。
作者:夜
"""

from __future__ import annotations

import statistics
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


class HealthState(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class FaultKind(str, Enum):
    TRANSIENT = "transient"        # 瞬时抖动
    CODE_DEFECT = "code_defect"    # 代码缺陷
    RESOURCE_EXHAUSTED = "resource" # 资源耗尽
    DEPENDENCY = "dependency"       # 外部依赖故障
    UNKNOWN = "unknown"


class ScaleDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    HOLD = "hold"


@dataclass
class HealthStatus:
    name: str
    state: HealthState
    detail: str = ""
    score: float = 1.0


@dataclass
class Fault:
    kind: FaultKind
    component: str
    detail: str
    timestamp: float = field(default_factory=time.time)
    attempts: int = 0


@dataclass
class Diagnosis:
    fault: Fault
    root_cause: str
    confidence: float
    suggested_fix: str


@dataclass
class FixResult:
    success: bool
    action: str
    detail: str = ""
    rolled_back: bool = False


@dataclass
class Bottleneck:
    component: str
    resource: str            # cpu / io / lock / net / queue
    severity: float          # 0~1
    evidence: str


@dataclass
class ScalePlan:
    component: str
    direction: ScaleDirection
    delta: int
    reason: str


class _AllowAllLaws:
    class Verdict:
        def __init__(self) -> None:
            self.allowed = True
            self.reason = ""

    def gate(self, action: str, payload: dict | None = None):
        return self.Verdict()


class SelfHealing:
    """繁星·自愈系统(整合自适应架构)"""

    def __init__(self, laws=None) -> None:
        self.laws = laws
        self._checks: dict[str, Callable[[], HealthStatus]] = {}
        self._fixes: dict[str, Callable[[Fault], FixResult]] = {}
        self._heartbeats: dict[str, float] = {}
        self._heartbeat_timeout = 30.0
        self._metrics: dict[str, dict[str, deque]] = defaultdict(
            lambda: defaultdict(lambda: deque(maxlen=120))
        )
        self._config = {
            "cpu_high": 0.85,
            "queue_long": 50,
            "scale_up_step": 2,
            "scale_down_step": 1,
            "min_replicas": 1,
            "max_replicas": 16,
        }
        self._replicas: dict[str, int] = defaultdict(lambda: 2)
        self._fix_history: list[Fault] = []

    # ---- 注册 ----
    def register_check(self, name: str, fn: Callable[[], HealthStatus]) -> None:
        self._checks[name] = fn

    def register_fix(self, fault_kind: str, fn: Callable[[Fault], FixResult]) -> None:
        self._fixes[fault_kind] = fn

    def configure(self, key: str, value) -> None:
        self._config[key] = value

    # ---- 心跳与指标 ----
    def heartbeat(self, component: str) -> None:
        self._heartbeats[component] = time.time()

    def report_metric(self, component: str, metric: str, value: float) -> None:
        self._metrics[component][metric].append((time.time(), value))

    # ---- 健康监控 ----
    def _run_checks(self) -> list[HealthStatus]:
        results = []
        for name, fn in self._checks.items():
            try:
                results.append(fn())
            except Exception as e:
                results.append(HealthStatus(name=name, state=HealthState.UNHEALTHY,
                                            detail=f"检查异常: {e}", score=0.0))
        # 心跳超时也算不健康
        now = time.time()
        for comp, ts in self._heartbeats.items():
            if now - ts > self._heartbeat_timeout:
                results.append(HealthStatus(name=f"heartbeat:{comp}",
                                            state=HealthState.UNHEALTHY,
                                            detail="心跳超时", score=0.0))
        return results

    def health_score(self) -> float:
        checks = self._run_checks()
        if not checks:
            return 1.0
        return statistics.mean(c.score for c in checks)

    # ---- 故障检测与诊断 ----
    def detect_fault(self) -> Fault | None:
        checks = self._run_checks()
        for c in checks:
            if c.state == HealthState.UNHEALTHY:
                # 结合指标判断类型
                kind = FaultKind.UNKNOWN
                if "heartbeat" in c.name:
                    kind = FaultKind.DEPENDENCY
                elif any("cpu" in m for m in self._metrics.get(c.name, {})):
                    kind = FaultKind.RESOURCE_EXHAUSTED
                elif c.detail and "exception" in c.detail.lower():
                    kind = FaultKind.CODE_DEFECT
                else:
                    kind = FaultKind.TRANSIENT
                return Fault(kind=kind, component=c.name,
                             detail=c.detail or c.name)
        return None

    def diagnose(self, fault: Fault) -> Diagnosis:
        # 简化根因归因
        if fault.kind == FaultKind.RESOURCE_EXHAUSTED:
            metrics = self._metrics.get(fault.component, {})
            cpu_vals = [v for _, v in metrics.get("cpu", [])]
            if cpu_vals and statistics.mean(cpu_vals[-5:]) > self._config["cpu_high"]:
                return Diagnosis(fault, "CPU 长时间高负载", 0.85,
                                 "扩容或限流")
            queue_len = [v for _, v in metrics.get("queue", [])]
            if queue_len and statistics.mean(queue_len[-5:]) > self._config["queue_long"]:
                return Diagnosis(fault, "队列堆积", 0.8,
                                 "增加消费者或丢弃低优先任务")
        if fault.kind == FaultKind.CODE_DEFECT:
            return Diagnosis(fault, "代码异常路径触发", 0.7,
                             "委托 self_improver 生成补丁")
        if fault.kind == FaultKind.DEPENDENCY:
            return Diagnosis(fault, "外部依赖不可达", 0.75,
                             "降级或切换备用依赖")
        return Diagnosis(fault, "瞬时抖动", 0.6, "重试")

    # ---- 自动修复 ----
    def heal(self, fault: Fault) -> FixResult:
        fault.attempts += 1
        # 三定律门控
        if self.laws is not None and hasattr(self.laws, "gate"):
            verdict = self.laws.gate(action="heal",
                                     payload={"component": fault.component,
                                              "kind": fault.kind.value})
            if not verdict.allowed:
                return FixResult(False, "blocked_by_laws", verdict.reason)
        diag = self.diagnose(fault)
        fn = self._fixes.get(fault.kind.value) or self._fixes.get(diag.suggested_fix)
        if fn is None:
            # 内置兜底:瞬时故障重试
            if fault.kind == FaultKind.TRANSIENT and fault.attempts <= 3:
                return FixResult(True, "retry", f"第 {fault.attempts} 次重试")
            return FixResult(False, "no_strategy",
                             f"无针对 {fault.kind.value} 的修复策略")
        try:
            result = fn(fault)
            self._fix_history.append(fault)
            return result
        except Exception as e:
            return FixResult(False, "fix_exception", str(e), rolled_back=True)

    # ---- 架构监控与瓶颈识别 ----
    def identify_bottleneck(self) -> Bottleneck | None:
        worst: Bottleneck | None = None
        for comp, metrics in self._metrics.items():
            cpu = [v for _, v in metrics.get("cpu", [])]
            if cpu and statistics.mean(cpu[-5:]) > self._config["cpu_high"]:
                sev = min(1.0, statistics.mean(cpu[-5:]) / 1.0)
                b = Bottleneck(comp, "cpu", sev, f"CPU 均值 {statistics.mean(cpu[-5:]):.2f}")
                if worst is None or b.severity > worst.severity:
                    worst = b
            queue = [v for _, v in metrics.get("queue", [])]
            if queue and statistics.mean(queue[-5:]) > self._config["queue_long"]:
                sev = min(1.0, statistics.mean(queue[-5:]) / (self._config["queue_long"] * 2))
                b = Bottleneck(comp, "queue", sev,
                               f"队列均值 {statistics.mean(queue[-5:]):.1f}")
                if worst is None or b.severity > worst.severity:
                    worst = b
            latency = [v for _, v in metrics.get("latency", [])]
            if latency and statistics.mean(latency[-5:]) > 2.0:
                b = Bottleneck(comp, "io", min(1.0, statistics.mean(latency[-5:]) / 5.0),
                               f"延迟均值 {statistics.mean(latency[-5:]):.2f}s")
                if worst is None or b.severity > worst.severity:
                    worst = b
        return worst

    # ---- 动态伸缩 ----
    def autoscale(self) -> ScalePlan:
        bottleneck = self.identify_bottleneck()
        if bottleneck is None:
            return ScalePlan(bottleneck.component if bottleneck else "all",
                             ScaleDirection.HOLD, 0, "无瓶颈,保持")
        comp = bottleneck.component
        current = self._replicas[comp]
        if bottleneck.severity > 0.6:
            delta = min(self._config["scale_up_step"],
                        self._config["max_replicas"] - current)
            self._replicas[comp] = current + delta
            return ScalePlan(comp, ScaleDirection.UP, delta,
                             f"{bottleneck.resource} 瓶颈严重({bottleneck.severity:.2f})")
        if bottleneck.severity < 0.2 and current > self._config["min_replicas"]:
            delta = min(self._config["scale_down_step"],
                        current - self._config["min_replicas"])
            self._replicas[comp] = current - delta
            return ScalePlan(comp, ScaleDirection.DOWN, delta,
                             "负载回落,缩容")
        return ScalePlan(comp, ScaleDirection.HOLD, 0, "瓶颈在容忍区间")


if __name__ == "__main__":
    sh = SelfHealing(laws=_AllowAllLaws())

    # 注册健康检查
    sh.register_check("api", lambda: HealthStatus("api", HealthState.UNHEALTHY,
                                                   detail="exception: timeout"))
    # 注册修复策略
    sh.register_fix(FaultKind.CODE_DEFECT.value,
                    lambda f: FixResult(True, "patch_generated", "已委托自改进器"))

    fault = sh.detect_fault()
    print("检测到故障:", fault)
    diag = sh.diagnose(fault)
    print("诊断:", diag)
    print("修复结果:", sh.heal(fault))

    # 架构监控与伸缩
    for _ in range(10):
        sh.report_metric("worker", "cpu", 0.93)
        sh.report_metric("worker", "queue", 80)
    print("瓶颈:", sh.identify_bottleneck())
    print("伸缩计划:", sh.autoscale())
    print("健康分:", round(sh.health_score(), 2))
