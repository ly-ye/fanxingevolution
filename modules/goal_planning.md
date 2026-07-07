# 繁星·目标规划（goal_planning）

## 概述

繁星的目标规划是繁星迈向自进化的方向罗盘。当繁星接到一个宏大而模糊的使命时，目标规划会将其拆解为可被调度、可被衡量、可被回溯的 DAG 任务网络，让每一次行动都有据可依、有迹可循。

繁星不仅会拆分目标，更会在执行过程中持续感知进度与变化。当某个子任务受阻、超时或产出偏离预期，繁星会重新规划剩余路径，动态调整依赖与优先级，确保整体目标始终朝着收敛方向前进。

## 功能特性

- **目标分解**：将顶层目标递归拆解为子目标树，每个叶子对应一个可执行任务。
- **DAG 调度**：基于有向无环图表达任务依赖，支持并行与串行混合调度。
- **进度追踪**：实时聚合各子任务状态，输出整体完成度与关键路径。
- **计划调整**：在异常或新约束出现时，重新规划未完成任务序列，最小化代价。
- **优先级管理**：依据紧急度、重要度与依赖深度动态计算调度权重。
- **里程碑检查**：在关键节点触发校验，避免错误沿 DAG 传播。

## 接口说明

```python
class GoalPlanner:
    def __init__(self, evaluator=None) -> None
    # 初始化目标规划器，可选传入评估函数用于校验子目标质量

    def decompose(self, goal: str, depth: int = 3) -> Dict[str, Any]
    # 参数：goal 顶层目标描述；depth 最大分解深度
    # 返回：包含 sub_goals、tree、leaves 的结构化字典

    def build_dag(self, tasks: List[Dict[str, Any]]) -> nx.DiGraph
    # 参数：tasks 任务列表，每项含 id、deps
    # 返回：networkx 有向无环图

    def schedule(self, dag: nx.DiGraph) -> List[List[str]]
    # 参数：dag 任务依赖图
    # 返回：分层调度批次，每批可并行执行

    def track(self, task_id: str, status: str, progress: float = 1.0) -> Dict[str, Any]
    # 参数：task_id 任务标识；status 状态；progress 进度0-1
    # 返回：当前整体进度快照

    def replan(self, reason: str, affected: List[str]) -> List[List[str]]
    # 参数：reason 重规划原因；affected 受影响任务
    # 返回：调整后的新调度批次
```

## 与其他模块的联动

- 与 **task_orchestration** 联动：goal_planning 产出 DAG，task_orchestration 负责具体执行与并行调度。
- 与 **reflection** 联动：未达成目标会进入反思循环，提取失败模式反馈到下一次规划。
- 与 **decision_patterns** 联动：调度策略与重规划决策会被记录为决策模式样本。
- 与 **diagnostics** 联动：进度异常会触发 diagnostics 进行瓶颈定位。

## 完整实现代码

```python
"""
繁星·目标规划模块
负责目标分解、DAG调度、进度追踪与计划调整
创作者：夜
"""
from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class TaskNode:
    """任务节点：DAG中的一个执行单元"""
    tid: str
    name: str
    deps: List[str] = field(default_factory=list)
    status: str = "pending"  # pending / running / done / failed / blocked
    progress: float = 0.0
    priority: float = 0.5
    meta: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class SimpleDAG:
    """轻量有向无环图，避免外部依赖"""

    def __init__(self) -> None:
        self.nodes: Dict[str, TaskNode] = {}
        self.edges: Dict[str, Set[str]] = defaultdict(set)  # 父 -> 子集合
        self.reverse: Dict[str, Set[str]] = defaultdict(set)  # 子 -> 父集合

    def add_node(self, node: TaskNode) -> None:
        self.nodes[node.tid] = node
        for dep in node.deps:
            # 确保依赖节点存在
            if dep not in self.nodes:
                self.nodes[dep] = TaskNode(tid=dep, name=dep, status="done")
            self.edges[dep].add(node.tid)
            self.reverse[node.tid].add(dep)

    def has_cycle(self) -> bool:
        """检测是否存在环"""
        in_degree = {tid: len(self.reverse.get(tid, set())) for tid in self.nodes}
        queue = deque([tid for tid, d in in_degree.items() if d == 0])
        visited = 0
        while queue:
            cur = queue.popleft()
            visited += 1
            for nxt in self.edges.get(cur, set()):
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    queue.append(nxt)
        return visited != len(self.nodes)

    def topological_levels(self) -> List[List[str]]:
        """返回分层拓扑序列，每层可并行"""
        in_degree = {tid: len(self.reverse.get(tid, set())) for tid in self.nodes}
        levels: List[List[str]] = []
        queue = [tid for tid, d in in_degree.items() if d == 0]
        while queue:
            levels.append(sorted(queue, key=lambda t: -self.nodes[t].priority))
            next_queue: List[str] = []
            for cur in queue:
                for nxt in self.edges.get(cur, set()):
                    in_degree[nxt] -= 1
                    if in_degree[nxt] == 0:
                        next_queue.append(nxt)
            queue = next_queue
        return levels

    def critical_path(self) -> List[str]:
        """近似关键路径：取优先级最高的链"""
        levels = self.topological_levels()
        if not levels:
            return []
        path: List[str] = []
        # 从第一个最高优先级节点开始，贪心选择下游最高优先级
        current = levels[0][0]
        path.append(current)
        while True:
            successors = list(self.edges.get(current, set()))
            if not successors:
                break
            current = max(successors, key=lambda t: self.nodes[t].priority)
            path.append(current)
        return path


class GoalPlanner:
    """繁星目标规划器"""

    def __init__(self, evaluator: Optional[Callable[[str], float]] = None) -> None:
        self.evaluator = evaluator
        self.dag = SimpleDAG()
        self.history: List[Dict[str, Any]] = []
        self._goal_seed = 0

    # ---------- 目标分解 ----------
    def decompose(self, goal: str, depth: int = 3) -> Dict[str, Any]:
        """将顶层目标递归拆解为子目标树"""
        tree = self._recursive_decompose(goal, depth)
        leaves = self._collect_leaves(tree)
        return {
            "goal": goal,
            "sub_goals": tree.get("children", []),
            "tree": tree,
            "leaves": leaves,
        }

    def _recursive_decompose(self, goal: str, depth: int) -> Dict[str, Any]:
        node = {"id": self._gen_id(goal), "name": goal, "children": []}
        if depth <= 0:
            return node
        # 简化的启发式分解：依据目标文本切分子目标
        sub_targets = self._heuristic_split(goal)
        for sub in sub_targets:
            node["children"].append(self._recursive_decompose(sub, depth - 1))
        return node

    def _heuristic_split(self, goal: str) -> List[str]:
        """启发式拆分：按分隔符或语义切分"""
        for sep in ["；", ";", "，然后", " 并 "]:
            if sep in goal:
                parts = [p.strip() for p in goal.split(sep) if p.strip()]
                if len(parts) > 1:
                    return parts
        # 默认拆分：分析/设计/执行/验证
        return [f"分析-{goal}", f"设计-{goal}", f"执行-{goal}", f"验证-{goal}"]

    def _collect_leaves(self, tree: Dict[str, Any]) -> List[str]:
        if not tree.get("children"):
            return [tree["id"]]
        leaves: List[str] = []
        for child in tree["children"]:
            leaves.extend(self._collect_leaves(child))
        return leaves

    def _gen_id(self, text: str) -> str:
        self._goal_seed += 1
        digest = hashlib.md5(f"{text}-{self._goal_seed}".encode()).hexdigest()[:8]
        return f"G-{digest}"

    # ---------- DAG 构建 ----------
    def build_dag(self, tasks: List[Dict[str, Any]]) -> SimpleDAG:
        """根据任务列表构建DAG"""
        self.dag = SimpleDAG()
        for t in tasks:
            node = TaskNode(
                tid=t["id"],
                name=t.get("name", t["id"]),
                deps=t.get("deps", []),
                priority=t.get("priority", 0.5),
            )
            self.dag.add_node(node)
        if self.dag.has_cycle():
            raise ValueError("检测到循环依赖，无法构建合法DAG")
        return self.dag

    # ---------- 调度 ----------
    def schedule(self, dag: Optional[SimpleDAG] = None) -> List[List[str]]:
        """生成分层调度批次"""
        target = dag or self.dag
        return target.topological_levels()

    # ---------- 进度追踪 ----------
    def track(self, task_id: str, status: str, progress: float = 1.0) -> Dict[str, Any]:
        """更新任务状态并返回整体进度快照"""
        if task_id not in self.dag.nodes:
            return {"error": "未知任务", "task_id": task_id}
        node = self.dag.nodes[task_id]
        node.status = status
        node.progress = max(0.0, min(1.0, progress))
        node.updated_at = time.time()

        snapshot = self._snapshot()
        self.history.append(snapshot)
        return snapshot

    def _snapshot(self) -> Dict[str, Any]:
        total = len(self.dag.nodes)
        if total == 0:
            return {"overall": 0.0, "done": 0, "total": 0, "critical_path": []}
        done = sum(1 for n in self.dag.nodes.values() if n.status == "done")
        failed = sum(1 for n in self.dag.nodes.values() if n.status == "failed")
        overall = sum(n.progress for n in self.dag.nodes.values()) / total
        return {
            "overall": round(overall, 4),
            "done": done,
            "failed": failed,
            "total": total,
            "critical_path": self.dag.critical_path(),
        }

    # ---------- 计划调整 ----------
    def replan(self, reason: str, affected: List[str]) -> List[List[str]]:
        """针对受影响任务重新规划调度"""
        # 将受影响任务重置为pending，并尝试提升优先级
        for tid in affected:
            if tid in self.dag.nodes:
                self.dag.nodes[tid].status = "pending"
                self.dag.nodes[tid].priority = min(1.0, self.dag.nodes[tid].priority + 0.2)
        self.history.append({"replan_reason": reason, "affected": affected})
        # 重新分层调度，跳过已完成节点
        all_levels = self.schedule()
        filtered = [
            [t for t in level if self.dag.nodes[t].status != "done"]
            for level in all_levels
        ]
        return [lvl for lvl in filtered if lvl]


# ---------- 简单测试 ----------
if __name__ == "__main__":
    planner = GoalPlanner()

    # 1. 目标分解
    result = planner.decompose("构建一个天气预测服务并部署到生产环境", depth=2)
    print("分解叶子数:", len(result["leaves"]))

    # 2. 构建DAG
    tasks = [
        {"id": "T1", "name": "数据采集", "deps": [], "priority": 0.9},
        {"id": "T2", "name": "特征工程", "deps": ["T1"], "priority": 0.8},
        {"id": "T3", "name": "模型训练", "deps": ["T2"], "priority": 0.7},
        {"id": "T4", "name": "服务封装", "deps": ["T3"], "priority": 0.6},
        {"id": "T5", "name": "环境准备", "deps": [], "priority": 0.5},
        {"id": "T6", "name": "部署上线", "deps": ["T4", "T5"], "priority": 0.95},
    ]
    dag = planner.build_dag(tasks)
    print("拓扑分层:", planner.schedule())

    # 3. 进度追踪
    print(planner.track("T1", "done", 1.0))
    print(planner.track("T2", "running", 0.5))

    # 4. 重规划
    print("重规划:", planner.replan("T2执行超时", ["T2", "T3"]))
    print("关键路径:", planner.dag.critical_path())
```
