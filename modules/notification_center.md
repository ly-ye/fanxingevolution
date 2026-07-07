# 繁星·通知中心（notification_center）

## 概述

繁星的通知中心整合自通知中心与监控告警,是繁星向外传递信号的灯塔。它既负责多渠道通知的订阅、模板与广播,也承担指标收集、阈值监控、告警触发与健康检查的职责。当繁星内部发生任何值得告知的事——故障、瓶颈、阈值越界、任务完成——通知中心都会把信号转化为恰当的消息,送达正确的接收者。

通知不是噪音。每一条通知都带着级别、渠道、模板与订阅者,繁星会在告警风暴时自动去重与抑制,在阈值恢复时发出解除通知。好的通知中心让繁星既不沉默,也不聒噪。

## 功能特性

- **多渠道通知**:支持控制台、日志、Webhook、邮件等渠道,可扩展。
- **订阅管理**:接收者按主题与级别订阅,只收关心的通知。
- **模板系统**:通知模板支持变量插值,统一消息格式。
- **广播**:向所有订阅者广播紧急通知。
- **指标收集**:采集命名指标的时间序列,供阈值监控。
- **阈值监控**:按指标设阈值,越界触发告警通知。
- **告警触发**:告警去重、抑制、升级与解除。
- **健康检查**:注册健康检查项,周期评估并产出健康分。

## 接口说明

```python
class NotificationCenter:
    def __init__(self) -> None
    # 初始化通知中心。

    def register_channel(self, name: str, sender: Callable[[Notification], bool]) -> None
    # 注册一个通知渠道(如 webhook、email)。

    def subscribe(self, subscriber: str, topic: str, level: str = "info") -> None
    # 订阅者按主题与级别订阅通知。

    def unsubscribe(self, subscriber: str, topic: str | None = None) -> None
    # 取消订阅。

    def register_template(self, name: str, template: str) -> None
    # 注册通知模板(支持 {var} 插值)。

    def notify(self, topic: str, level: str, title: str, body: str,
               template: str | None = None, ctx: dict | None = None) -> str
    # 发送通知,返回通知 ID。

    def broadcast(self, level: str, title: str, body: str) -> str
    # 向所有订阅者广播。

    def record_metric(self, name: str, value: float, tags: dict | None = None) -> None
    # 记录指标值。

    def set_threshold(self, metric: str, op: str, value: float,
                      topic: str, level: str = "warn") -> None
    # 设置指标阈值(op 为 gt/lt/ge/le/eq),越界触发告警。

    def register_health_check(self, name: str, fn: Callable[[], float]) -> None
    # 注册健康检查(返回 0~1 健康分)。

    def health_score(self) -> float
    # 返回整体健康分。

    def evaluate(self) -> list[str]
    # 评估所有阈值与健康检查,触发相应通知,返回通知 ID 列表。
```

## 与其他模块的联动

- **self_healing**:故障与瓶颈事件通过通知中心广播;健康检查委托此处。
- **scheduler**:周期性触发 `evaluate` 进行阈值监控与健康检查。
- **evolution_laws**:三定律门控决策可通过通知中心广播给订阅者。
- **configuration_management**:阈值、订阅、渠道配置通过配置管理注入。
- **session_manager**:用户会话内通知可定向投递。

## 完整实现代码

```python
"""繁星·通知中心

整合自通知中心与监控告警:多渠道通知 + 订阅 + 模板 + 广播
+ 指标收集 + 阈值监控 + 告警触发 + 健康检查。
作者:夜
"""

from __future__ import annotations

import statistics
import threading
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


class Level(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
    CRITICAL = "critical"


_LEVEL_RANK = {Level.DEBUG: 0, Level.INFO: 1, Level.WARN: 2,
               Level.ERROR: 3, Level.CRITICAL: 4}


@dataclass
class Notification:
    """通知"""
    notification_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    topic: str = ""
    level: Level = Level.INFO
    title: str = ""
    body: str = ""
    timestamp: float = field(default_factory=time.time)
    ctx: dict = field(default_factory=dict)


@dataclass
class Threshold:
    """阈值规则"""
    metric: str
    op: str            # gt/lt/ge/le/eq
    value: float
    topic: str
    level: Level = Level.WARN
    last_triggered: float = 0.0
    triggered: bool = False


class NotificationCenter:
    """繁星·通知中心(整合监控告警)"""

    def __init__(self) -> None:
        self._channels: dict[str, Callable[[Notification], bool]] = {}
        self._subscribers: dict[str, list[tuple[str, Level]]] = defaultdict(list)
        # topic -> [(subscriber, min_level)]
        self._templates: dict[str, str] = {}
        self._metrics: dict[str, deque] = defaultdict(lambda: deque(maxlen=600))
        # name -> [(ts, value, tags)]
        self._thresholds: list[Threshold] = []
        self._health_checks: dict[str, Callable[[], float]] = {}
        self._inhibit_window = 30.0  # 抑制窗口(秒)
        self._history: list[Notification] = []
        self._lock = threading.RLock()

    # ---- 渠道 ----
    def register_channel(self, name: str, sender: Callable[[Notification], bool]) -> None:
        self._channels[name] = sender

    def _send_via_channels(self, notification: Notification) -> None:
        for name, sender in self._channels.items():
            try:
                sender(notification)
            except Exception:
                pass  # 渠道故障不影响其他渠道

    # ---- 订阅 ----
    def subscribe(self, subscriber: str, topic: str, level: str = "info") -> None:
        with self._lock:
            lvl = Level(level)
            self._subscribers[topic].append((subscriber, lvl))

    def unsubscribe(self, subscriber: str, topic: str | None = None) -> None:
        with self._lock:
            if topic is None:
                for t in list(self._subscribers.keys()):
                    self._subscribers[t] = [(s, l) for (s, l) in self._subscribers[t]
                                            if s != subscriber]
            else:
                self._subscribers[topic] = [(s, l) for (s, l) in self._subscribers[topic]
                                            if s != subscriber]

    def _recipients(self, topic: str, level: Level) -> list[str]:
        recipients = []
        for sub, min_level in self._subscribers.get(topic, []):
            if _LEVEL_RANK[level] >= _LEVEL_RANK[min_level]:
                recipients.append(sub)
        return recipients

    # ---- 模板 ----
    def register_template(self, name: str, template: str) -> None:
        self._templates[name] = template

    def _render(self, template: str, ctx: dict) -> str:
        try:
            return template.format(**ctx)
        except (KeyError, IndexError):
            return template

    # ---- 通知 ----
    def notify(self, topic: str, level: str, title: str, body: str,
               template: str | None = None, ctx: dict | None = None) -> str:
        lvl = Level(level)
        ctx = ctx or {}
        if template and template in self._templates:
            body = self._render(self._templates[template], ctx)
        notification = Notification(topic=topic, level=lvl, title=title,
                                    body=body, ctx=ctx)
        with self._lock:
            self._history.append(notification)
            recipients = self._recipients(topic, lvl)
        notification.ctx["recipients"] = recipients
        self._send_via_channels(notification)
        return notification.notification_id

    def broadcast(self, level: str, title: str, body: str) -> str:
        lvl = Level(level)
        notification = Notification(topic="*broadcast*", level=lvl,
                                    title=title, body=body)
        with self._lock:
            self._history.append(notification)
            all_subs = set()
            for subs in self._subscribers.values():
                for sub, _ in subs:
                    all_subs.add(sub)
        notification.ctx["recipients"] = list(all_subs)
        self._send_via_channels(notification)
        return notification.notification_id

    # ---- 指标 ----
    def record_metric(self, name: str, value: float, tags: dict | None = None) -> None:
        with self._lock:
            self._metrics[name].append((time.time(), value, tags or {}))

    def metric_stats(self, name: str, window: int = 60) -> dict:
        with self._lock:
            series = list(self._metrics.get(name, []))
        if not series:
            return {}
        cutoff = time.time() - window
        recent = [v for ts, v, _ in series if ts >= cutoff]
        if not recent:
            return {}
        return {"count": len(recent), "min": min(recent), "max": max(recent),
                "avg": round(statistics.mean(recent), 4),
                "last": recent[-1]}

    # ---- 阈值 ----
    def set_threshold(self, metric: str, op: str, value: float,
                      topic: str, level: str = "warn") -> None:
        with self._lock:
            self._thresholds.append(Threshold(
                metric=metric, op=op, value=value, topic=topic, level=Level(level)
            ))

    def _check_threshold(self, th: Threshold) -> bool:
        series = list(self._metrics.get(th.metric, []))
        if not series:
            return False
        _, current, _ = series[-1]
        ops = {"gt": current > th.value, "lt": current < th.value,
               "ge": current >= th.value, "le": current <= th.value,
               "eq": current == th.value}
        return ops.get(th.op, False)

    # ---- 健康检查 ----
    def register_health_check(self, name: str, fn: Callable[[], float]) -> None:
        self._health_checks[name] = fn

    def health_score(self) -> float:
        scores = []
        for name, fn in self._health_checks.items():
            try:
                scores.append(fn())
            except Exception:
                scores.append(0.0)
        if not scores:
            return 1.0
        return statistics.mean(scores)

    # ---- 综合评估 ----
    def evaluate(self) -> list[str]:
        """评估阈值与健康检查,触发通知,返回通知 ID 列表"""
        notification_ids = []
        now = time.time()
        with self._lock:
            thresholds = list(self._thresholds)
        for th in thresholds:
            breached = self._check_threshold(th)
            if breached and not th.triggered:
                # 抑制窗口内不重复触发
                if now - th.last_triggered < self._inhibit_window:
                    continue
                nid = self.notify(th.topic, th.level.value,
                                  f"阈值告警: {th.metric} {th.op} {th.value}",
                                  f"指标 {th.metric} 越界,当前值 {self.metric_stats(th.metric).get('last')}")
                th.triggered = True
                th.last_triggered = now
                notification_ids.append(nid)
            elif not breached and th.triggered:
                nid = self.notify(th.topic, "info",
                                  f"告警解除: {th.metric}",
                                  f"指标 {th.metric} 已恢复至正常区间")
                th.triggered = False
                notification_ids.append(nid)
        # 健康检查
        score = self.health_score()
        if score < 0.5:
            nid = self.notify("health", "error", "健康检查告警",
                              f"整体健康分 {score:.2f},低于 0.5")
            notification_ids.append(nid)
        return notification_ids

    def history(self, limit: int = 50) -> list[Notification]:
        with self._lock:
            return list(reversed(self._history[-limit:]))


if __name__ == "__main__":
    nc = NotificationCenter()

    # 注册渠道:控制台打印
    nc.register_channel("console",
                        lambda n: print(f"[{n.level.value.upper()}] {n.topic}: {n.title} - {n.body}"))

    # 订阅
    nc.subscribe("ops_team", "cpu", "warn")
    nc.subscribe("ops_team", "health", "error")
    nc.subscribe("dev_team", "deploy", "info")

    # 模板
    nc.register_template("alert_tpl", "指标 {metric} 当前 {value},阈值 {threshold}")

    # 设置阈值
    nc.set_threshold("cpu_usage", "gt", 0.85, "cpu", "warn")
    nc.set_threshold("error_rate", "gt", 0.1, "health", "error")

    # 注册健康检查
    nc.register_health_check("api", lambda: 0.3)  # 不健康

    # 记录指标(越界)
    nc.record_metric("cpu_usage", 0.92)
    nc.record_metric("error_rate", 0.15)

    # 手动通知
    nid = nc.notify("deploy", "info", "部署完成", "v1.2.3 已上线")
    print("通知 ID:", nid)

    # 评估阈值与健康检查
    print("---- 评估 ----")
    triggered = nc.evaluate()
    print("触发通知数:", len(triggered))

    # 指标恢复后评估
    nc.record_metric("cpu_usage", 0.40)
    nc.record_metric("error_rate", 0.02)
    print("---- 恢复后评估 ----")
    triggered = nc.evaluate()
    print("触发通知数:", len(triggered))

    print("健康分:", round(nc.health_score(), 2))
    print("通知历史数:", len(nc.history()))
