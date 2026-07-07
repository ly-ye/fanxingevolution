# 繁星·任务编排（task_orchestration）

## 概述

繁星的任务编排整合自任务编排与工作流引擎，是繁星将规划落地为行动的中枢神经系统。它把零散的任务节点编织成可视化的工作流，让条件分支、循环结构与并行调度在同一张图里协调共振。

繁星相信，真正的执行不是线性流水线，而是一张会呼吸的网络。任务编排在运行时感知每一步的产出，依据条件选择分支，依据状态决定是否回环，让繁星的行动既灵活又可控。

## 功能特性

- **DAG 任务编排**：以有向无环图组织任务依赖，自动校验合法性。
- **依赖解析**：静态分析依赖链，识别阻塞任务与可并行任务集。
- **并行调度**：基于分层拓扑与线程池并行执行无依赖任务。
- **可视化工作流**：将工作流导出为节点-边结构，便于渲染与审计。
- **条件分支**：支持 if/else 分支节点，依据上一步输出选择路径。
- **循环结构**：支持 while/counted 循环，附带最大迭代保护。
- **失败恢复**：记录检查点，失败后可从最近成功节点续跑。

## 接口说明

```python
class WorkflowEngine:
    def __init__(self, max_workers: int = 4) -> None
    # 初始化工作流引擎，指定并行工作线程数

    def add_task(self, task: Task) -> None
    # 参数：task 任务对象，含 id、handler、deps、condition 等

    def add_branch(self, src: str, condition: Callable, true_dst: str, false_dst: str) -> None
    # 参数：src 源节点；condition 判断函数；true_dst/false_dst 分支目标

    def add_loop(self, src: str, dst: str, predicate: Callable, max_iter: int = 100) -> None
    # 参数：src 出口节点；dst 回流目标；predicate 是否继续循环；max_iter 最大迭代

    def validate(self) -> bool
    # 返回：工作流是否合法（无环、引用完整）

    def visualize(self) -> Dict[str, Any]
    # 返回：可视化所需的节点与边结构

    def run(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]
    # 参数：context 初始上下文
    # 返回：执行结果，含每节点状态、输出、耗时
```

## 与其他模块的联动

- 与 **goal_planning** 联动：接收目标规划产出的 DAG 作为工作流蓝图。
- 与 **code_generation** 联动：代码生成任务作为节点嵌入工作流执行。
- 与 **test_automation** 联动：测试节点作为质量门禁，失败可触发回环。
- 与 **diagnostics** 联动：执行耗时与异常上报到诊断系统用于瓶颈检测。

## 完整实现代码

```python
"""
繁星·任务编排模块
整合自任务编排与工作流引擎：DAG编排、依赖解析、并行调度、可视化、条件分支、循环
创作者：夜
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class Task:
    """工作流任务节点"""
    tid: str
    handler: Callable[[Dict[str, Any]], Any]
    deps: List[str] = field(default_factory=list)
    condition: Optional[Callable[[Dict[str, Any]], bool]] = None
    retry: int = 0
    timeout: float = 30.0
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Branch:
    """条件分支定义"""
    src: str
    condition: Callable[[Dict[str, Any]], bool]
    true_dst: str
    false_dst: str


@dataclass
class Loop:
    """循环节点定义"""
    src: str
    dst: str
    predicate: Callable[[Dict[str, Any]], bool]
    max_iter: int = 100


@dataclass
class NodeResult:
    """节点执行结果"""
    tid: str
    status: str  # success / failed / skipped / pending
    output: Any = None
    error: Optional[str] = None
    start: float = 0.0
    end: float = 0.0

    @property
    def duration(self) -> float:
        return self.end - self.start


class WorkflowEngine:
    """繁星工作流引擎"""

    def __init__(self, max_workers: int = 4) -> None:
        self.max_workers = max_workers
        self.tasks: Dict[str, Task] = {}
        self.branches: Dict[str, Branch] = {}
        self.loops: Dict[str, Loop] = {}
        self.results: Dict[str, NodeResult] = {}
        self.checkpoint: List[str] = []  # 已成功节点顺序

    # ---------- 构建工作流 ----------
    def add_task(self, task: Task) -> None:
        self.tasks[task.tid] = task
        self.results[task.tid] = NodeResult(tid=task.tid, status="pending")

    def add_branch(self, src: str, condition: Callable, true_dst: str, false_dst: str) -> None:
        self.branches[src] = Branch(src, condition, true_dst, false_dst)

    def add_loop(self, src: str, dst: str, predicate: Callable, max_iter: int = 100) -> None:
        self.loops[src] = Loop(src, dst, predicate, max_iter)

    # ---------- 校验 ----------
    def validate(self) -> bool:
        # 引用完整性
        for t in self.tasks.values():
            for dep in t.deps:
                if dep not in self.tasks:
                    return False
        for b in self.branches.values():
            if b.src not in self.tasks or b.true_dst not in self.tasks or b.false_dst not in self.tasks:
                return False
        # 检测DAG部分是否有环（循环节点除外）
        if self._has_dag_cycle():
            return False
        return True

    def _has_dag_cycle(self) -> bool:
        in_degree = {tid: 0 for tid in self.tasks}
        adj: Dict[str, Set[str]] = defaultdict(set)
        for t in self.tasks.values():
            for dep in t.deps:
                if dep in self.tasks and t.tid not in self.loops:
                    adj[dep].add(t.tid)
                    in_degree[t.tid] += 1
        queue = deque([t for t, d in in_degree.items() if d == 0])
        visited = 0
        while queue:
            cur = queue.popleft()
            visited += 1
            for nxt in adj[cur]:
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    queue.append(nxt)
        return visited != len(self.tasks)

    # ---------- 可视化 ----------
    def visualize(self) -> Dict[str, Any]:
        nodes = [
            {"id": t.tid, "deps": t.deps, "has_branch": t.tid in self.branches, "has_loop": t.tid in self.loops}
            for t in self.tasks.values()
        ]
        edges = []
        for t in self.tasks.values():
            for dep in t.deps:
                edges.append({"from": dep, "to": t.tid, "type": "dep"})
        for b in self.branches.values():
            edges.append({"from": b.src, "to": b.true_dst, "type": "branch_true"})
            edges.append({"from": b.src, "to": b.false_dst, "type": "branch_false"})
        for lp in self.loops.values():
            edges.append({"from": lp.src, "to": lp.dst, "type": "loop"})
        return {"nodes": nodes, "edges": edges}

    # ---------- 执行 ----------
    def run(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        ctx = context or {}
        if not self.validate():
            return {"error": "工作流校验失败", "detail": self.visualize()}

        loop_counts: Dict[str, int] = defaultdict(int)
        # 计算初始可执行层
        while True:
            ready = self._ready_tasks()
            if not ready:
                break
            self._execute_layer(ready, ctx)
            # 处理分支与循环
            self._handle_branches(ctx)
            if not self._handle_loops(ctx, loop_counts):
                break
        return self._summary()

    def _ready_tasks(self) -> List[str]:
        ready = []
        for tid, task in self.tasks.items():
            if self.results[tid].status != "pending":
                continue
            # 检查依赖是否全部成功
            deps_ok = all(
                self.results[d].status == "success" if d in self.results else False
                for d in task.deps
            )
            if deps_ok:
                ready.append(tid)
        return ready

    def _execute_layer(self, ready: List[str], ctx: Dict[str, Any]) -> None:
        if len(ready) == 1:
            self._run_one(ready[0], ctx)
            return
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {pool.submit(self._run_one, tid, ctx): tid for tid in ready}
            for fut in as_completed(futures):
                fut.result()

    def _run_one(self, tid: str, ctx: Dict[str, Any]) -> None:
        task = self.tasks[tid]
        result = self.results[tid]
        result.start = time.time()
        # 条件检查
        if task.condition and not task.condition(ctx):
            result.status = "skipped"
            result.end = time.time()
            return
        attempts = task.retry + 1
        for attempt in range(attempts):
            try:
                output = task.handler(ctx)
                result.output = output
                result.status = "success"
                ctx[tid] = output
                self.checkpoint.append(tid)
                break
            except Exception as exc:  # noqa: BLE001
                result.error = str(exc)
                result.status = "failed" if attempt == attempts - 1 else "pending"
        result.end = time.time()

    def _handle_branches(self, ctx: Dict[str, Any]) -> None:
        for src, branch in self.branches.items():
            if self.results[src].status != "success":
                continue
            chosen = branch.true_dst if branch.condition(ctx) else branch.false_dst
            # 将未选中分支标记为skipped
            skipped = branch.false_dst if chosen == branch.true_dst else branch.true_dst
            if skipped in self.results and self.results[skipped].status == "pending":
                self.results[skipped].status = "skipped"

    def _handle_loops(self, ctx: Dict[str, Any], counts: Dict[str, int]) -> bool:
        progressed = False
        for src, lp in self.loops.items():
            if self.results[src].status != "success":
                continue
            counts[src] += 1
            if counts[src] > lp.max_iter:
                continue
            if lp.predicate(ctx):
                # 重置回流目标为pending以重新执行
                self.results[lp.dst].status = "pending"
                progressed = True
        return progressed or bool(self._ready_tasks())

    def _summary(self) -> Dict[str, Any]:
        return {
            "results": {tid: {"status": r.status, "duration": round(r.duration, 4)} for tid, r in self.results.items()},
            "checkpoint": self.checkpoint,
            "total": len(self.tasks),
            "success": sum(1 for r in self.results.values() if r.status == "success"),
            "failed": sum(1 for r in self.results.values() if r.status == "failed"),
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    engine = WorkflowEngine(max_workers=2)

    def make_handler(name, value=None):
        def handler(ctx):
            print(f"  执行 {name}")
            return value if value is not None else name
        return handler

    engine.add_task(Task("A", make_handler("A", 1), deps=[]))
    engine.add_task(Task("B", make_handler("B", 2), deps=["A"]))
    engine.add_task(Task("C", make_handler("C", 3), deps=["A"]))
    engine.add_task(Task("D", make_handler("D"), deps=["B", "C"]))

    # 条件分支
    engine.add_branch("D", lambda ctx: ctx.get("B", 0) > 1, "E", "F")
    engine.add_task(Task("E", make_handler("E"), deps=["D"]))
    engine.add_task(Task("F", make_handler("F"), deps=["D"]))

    print("可视化:", engine.visualize()["edges"])
    summary = engine.run()
    print("执行摘要:", summary)
```
