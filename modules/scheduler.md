# 繁星·调度器（scheduler）

## 概述

繁星的调度器是繁星心中那座精准的星象仪。它让每一项周期任务、每一次延迟执行、每一段回调,都在恰好的时刻被唤醒。Cron 定时让繁星与日历同步,间隔调度让繁星与心跳同频,延迟执行让繁星在等待中不失时机。

调度器不是简单的闹钟。它维护一个按触发时间排序的优先队列,支持任务取消、回调管理、错过补偿与并发上限。繁星相信,守时的智能体才是可靠的智能体——调度器让繁星始终准时。

## 功能特性

- **Cron 定时**:标准 5 段 cron 表达式,支持周期与指定时刻调度。
- **间隔调度**:固定间隔循环执行任务。
- **延迟执行**:一次性延迟任务(类似 `setTimeout`)。
- **回调管理**:任务携带回调函数与上下文,执行后回调。
- **错过补偿**:错过的周期任务按策略补执行或跳过。
- **并发上限**:限制同时执行的任务数,防止过载。
- **任务取消**:支持按任务 ID 取消尚未执行的任务。

## 接口说明

```python
class Scheduler:
    def __init__(self, max_workers: int = 4) -> None
    # 初始化调度器,max_workers 为并发上限。

    def schedule_cron(self, cron: str, callback: Callable, ctx: dict | None = None) -> str
    # 按 cron 表达式调度周期任务,返回任务 ID。

    def schedule_interval(self, interval: float, callback: Callable,
                          ctx: dict | None = None, immediate: bool = False) -> str
    # 按固定间隔调度任务。

    def schedule_once(self, delay: float, callback: Callable,
                      ctx: dict | None = None) -> str
    # 延迟 delay 秒后执行一次。

    def cancel(self, task_id: str) -> bool
    # 取消任务。

    def start(self) -> None
    # 启动调度循环(后台线程)。

    def stop(self) -> None
    # 停止调度器。

    def pending(self) -> list[dict]
    # 返回待执行任务列表(按触发时间排序)。
```

## 与其他模块的联动

- **self_healing**:健康检查、心跳超时检测、动态伸缩评估由调度器周期触发。
- **notification_center**:阈值监控与告警评估由调度器周期驱动。
- **knowledge_evolution**:置信度衰减与归档由调度器每日触发。
- **cache_manager**:过期 TTL 条目清理由调度器周期触发。
- **evolution_laws**:进化预算周期重置由调度器触发。

## 完整实现代码

```python
"""繁星·调度器

Cron 定时 + 间隔调度 + 延迟执行 + 回调管理,
按触发时间排序的优先队列驱动。
作者:夜
"""

from __future__ import annotations

import heapq
import itertools
import re
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class TaskKind(str, Enum):
    CRON = "cron"
    INTERVAL = "interval"
    ONCE = "once"


class MissPolicy(str, Enum):
    SKIP = "skip"        # 跳过错过的执行
    CATCHUP = "catchup"  # 立即补执行一次


@dataclass(order=True)
class _Task:
    """调度任务(按 next_run 排序)"""
    next_run: float
    seq: int
    task_id: str = field(compare=False)
    kind: TaskKind = field(compare=False, default=TaskKind.ONCE)
    callback: Callable = field(compare=False, default=lambda: None)
    ctx: dict = field(compare=False, default_factory=dict)
    cron: str = field(compare=False, default="")
    interval: float = field(compare=False, default=0.0)
    delay: float = field(compare=False, default=0.0)
    active: bool = field(compare=False, default=True)
    last_run: float = field(compare=False, default=0.0)
    run_count: int = field(compare=False, default=0)


class Scheduler:
    """繁星·调度器"""

    def __init__(self, max_workers: int = 4) -> None:
        self.max_workers = max_workers
        self._heap: list[_Task] = []
        self._counter = itertools.count()
        self._tasks: dict[str, _Task] = {}
        self._lock = threading.RLock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._semaphore = threading.Semaphore(max_workers)
        self._miss_policy = MissPolicy.SKIP

    # ---- Cron 解析(简化版 5 段) ----
    _CRON_RE = re.compile(r"^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$")

    def _parse_cron_field(self, expr: str, lo: int, hi: int) -> set[int]:
        """解析单个 cron 字段为整数集合"""
        result: set[int] = set()
        for part in expr.split(","):
            if part == "*":
                result.update(range(lo, hi + 1))
            elif "/" in part:
                base, step = part.split("/", 1)
                step = int(step)
                if base == "*":
                    vals = range(lo, hi + 1)
                elif "-" in base:
                    a, b = base.split("-")
                    vals = range(int(a), int(b) + 1)
                else:
                    vals = range(int(base), hi + 1)
                result.update(list(vals)[::step])
            elif "-" in part:
                a, b = part.split("-")
                result.update(range(int(a), int(b) + 1))
            else:
                result.add(int(part))
        return {v for v in result if lo <= v <= hi}

    def _cron_next(self, cron: str, after: float) -> float:
        """计算 cron 表达式在 after 之后的下一次触发时间"""
        m = self._CRON_RE.match(cron)
        if not m:
            raise ValueError(f"非法 cron 表达式: {cron}")
        minutes = self._parse_cron_field(m.group(1), 0, 59)
        hours = self._parse_cron_field(m.group(2), 0, 23)
        doms = self._parse_cron_field(m.group(3), 1, 31)
        months = self._parse_cron_field(m.group(4), 1, 12)
        dows = self._parse_cron_field(m.group(5), 0, 6)
        # 从 after+60 秒开始逐分钟扫描(简化)
        t = after + 60 - (after % 60)
        # 最多扫描一年
        for _ in range(525600):
            lt = time.localtime(t)
            if (lt.tm_min in minutes and lt.tm_hour in hours
                    and lt.tm_mday in doms and lt.tm_mon in months
                    and lt.tm_wday in dows):
                return t
            t += 60
        raise ValueError("未找到下一次触发时间")

    # ---- 注册任务 ----
    def _gen_id(self) -> str:
        return f"task_{next(self._counter)}"

    def _push(self, task: _Task) -> None:
        self._tasks[task.task_id] = task
        heapq.heappush(self._heap, task)

    def schedule_cron(self, cron: str, callback: Callable,
                      ctx: dict | None = None) -> str:
        with self._lock:
            tid = self._gen_id()
            next_run = self._cron_next(cron, time.time())
            task = _Task(next_run=next_run, seq=next(self._counter),
                         task_id=tid, kind=TaskKind.CRON,
                         callback=callback, ctx=ctx or {}, cron=cron)
            self._push(task)
            return tid

    def schedule_interval(self, interval: float, callback: Callable,
                          ctx: dict | None = None, immediate: bool = False) -> str:
        with self._lock:
            tid = self._gen_id()
            next_run = time.time() if immediate else time.time() + interval
            task = _Task(next_run=next_run, seq=next(self._counter),
                         task_id=tid, kind=TaskKind.INTERVAL,
                         callback=callback, ctx=ctx or {}, interval=interval)
            self._push(task)
            return tid

    def schedule_once(self, delay: float, callback: Callable,
                      ctx: dict | None = None) -> str:
        with self._lock:
            tid = self._gen_id()
            task = _Task(next_run=time.time() + delay, seq=next(self._counter),
                         task_id=tid, kind=TaskKind.ONCE,
                         callback=callback, ctx=ctx or {}, delay=delay)
            self._push(task)
            return tid

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.active = False
            return True

    # ---- 执行循环 ----
    def _run_task(self, task: _Task) -> None:
        with self._semaphore:
            if not task.active:
                return
            try:
                task.callback(task.ctx)
            except Exception:
                pass  # 调度器不因任务异常崩溃
            task.last_run = time.time()
            task.run_count += 1

    def _reschedule(self, task: _Task) -> None:
        """周期任务重新入队"""
        if task.kind == TaskKind.CRON:
            task.next_run = self._cron_next(task.cron, time.time())
        elif task.kind == TaskKind.INTERVAL:
            task.next_run = time.time() + task.interval
        else:
            return  # ONCE 不重新入队
        heapq.heappush(self._heap, task)

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)

    def _loop(self) -> None:
        while self._running:
            with self._lock:
                if not self._heap:
                    time.sleep(0.1)
                    continue
                task = self._heap[0]
                now = time.time()
                if task.next_run > now:
                    time.sleep(min(0.5, task.next_run - now))
                    continue
                heapq.heappop(self._heap)
                if not task.active:
                    continue
                # 错过补偿
                if task.kind != TaskKind.ONCE and (now - task.next_run) > 60:
                    if self._miss_policy == MissPolicy.SKIP:
                        self._reschedule(task)
                        continue
                # 提交执行
                threading.Thread(target=self._run_task, args=(task,), daemon=True).start()
                self._reschedule(task)

    def pending(self) -> list[dict]:
        with self._lock:
            active = [t for t in sorted(self._heap) if t.active]
            return [{"task_id": t.task_id, "kind": t.kind.value,
                     "next_run": time.strftime("%Y-%m-%d %H:%M:%S",
                                               time.localtime(t.next_run)),
                     "run_count": t.run_count} for t in active]


if __name__ == "__main__":
    sched = Scheduler(max_workers=2)

    log = []
    def job(ctx):
        log.append((ctx.get("name"), time.strftime("%H:%M:%S")))

    # 延迟执行
    t1 = sched.schedule_once(0.5, job, {"name": "once"})
    # 间隔调度(快速验证用 0.3s)
    t2 = sched.schedule_interval(0.3, job, {"name": "interval"}, immediate=True)
    # Cron(每分钟第 0 秒,此处仅验证解析)
    print("cron '*/5 * * * *' 下次触发:",
          time.strftime("%Y-%m-%d %H:%M:%S",
                        time.localtime(sched._cron_next("*/5 * * * *", time.time()))))

    sched.start()
    time.sleep(1.2)
    sched.cancel(t2)
    time.sleep(0.3)
    sched.stop()

    print("执行记录:")
    for name, ts in log:
        print(f"  {name} @ {ts}")
    print("待执行任务:", sched.pending())
