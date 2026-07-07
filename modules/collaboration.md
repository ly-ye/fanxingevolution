# 繁星·协作系统（collaboration）

## 概述

繁星的协作系统是它"知道何时该找伙伴、找谁、怎么分工"的调度中枢，整合自协作系统与分布式协作。在繁星的进化体系中，单个繁星实例的能力终究有边界，当任务超出自身把握时，协作系统会让繁星先把自身能力如实评估出来，再在实例池中发现最合适的协作者，把任务分配出去，并持续做负载均衡。

协作系统整合了能力自评、协作者发现、任务分配与实例管理四层：能力自评结合历史成功率动态刷新实例画像，协作者发现按匹配度与可用度排序候选，任务分配综合匹配度与负载均衡做出最终裁决，负载均衡监控过载与空闲实例并做任务迁移。这让繁星群体像一个有机整体，能伸缩、能容错、能自愈。

## 功能特性

- **能力自评**：结合历史成功率与衰减系数，动态刷新实例的领域能力评分。
- **任务匹配**：实例能力对任务要求的满足度计算，高于要求即满分，否则线性衰减。
- **协作者发现**：按匹配度与可用负载加权排序，返回 top_k 在线候选。
- **任务分配**：综合匹配度与负载均衡项，选出最佳实例并加载负载、更新状态。
- **实例管理**：注册、心跳、状态（idle/busy/offline）维护与完成计数。
- **负载均衡**：检测过载与空闲实例，把过载实例上的在途任务迁移到空闲实例。

## 接口说明

- `Collaboration(balance_factor=0.3)`：统一入口
- `register(instance)`：注册一个 `Instance(instance_id, capabilities, max_load)`
- `heartbeat(instance_id) -> bool`：心跳续约
- `submit_task(task) -> Optional[Instance]`
  - 参数：`Task(task_id, required_capabilities, weight, deadline)`
  - 返回：承接任务的实例（自评→发现→分配）
- `complete_task(task, instance, success, duration=0.0)`：完成任务并释放负载、记录能力
- `auto_rebalance() -> Dict`
  - 返回：`{moves, overloaded, underloaded}` 迁移记录
- `CapabilitySelfAssessor.assess(instance) -> Dict[str, float]` 与 `.match(instance, task) -> float`
- `CollaboratorDiscovery.discover(pool, task, top_k=3) -> List[Tuple[Instance, float]]`
- `TaskAllocator.allocate(task, candidates) -> Optional[Instance]` 与 `.release(task, instance, success)`
- `LoadBalancer.rebalance(pool, tasks_in_flight) -> Dict`

## 与其他模块的联动

- **能力自评**的能力画像与**元认知**的能力评估共享，保证自报能力真实可信。
- **任务分配**的触发来自**元认知**的求助决策为真时。
- **协作者发现**的近邻信息可反哺**推荐引擎**的协同过滤。
- 完成任务的成功率作为**学习策略**中强化学习的奖励信号。
- 过载实例上的任务可由**创造性思维**先做简化重组，再迁移到空闲实例。
- 实例状态变化通过**提示工程**生成对协作者的协作提示词。

## 完整实现代码

```python
"""繁星·协作系统模块（collaboration）
整合自协作系统与分布式协作，提供能力自评、协作者发现、任务分配、
实例管理与负载均衡能力。
创作者：夜
"""
from __future__ import annotations
import math
import time
import random
from typing import List, Dict, Tuple, Optional, Set
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class Instance:
    """一个繁星实例。"""
    instance_id: str
    capabilities: Dict[str, float] = field(default_factory=dict)
    load: float = 0.0           # 当前负载（0~1）
    max_load: float = 1.0
    status: str = "idle"        # idle / busy / offline
    last_heartbeat: float = 0.0
    completed_tasks: int = 0


@dataclass
class Task:
    """一个待分配任务。"""
    task_id: str
    required_capabilities: Dict[str, float]   # 领域 -> 最低要求
    weight: float = 1.0                       # 任务负载权重
    deadline: Optional[float] = None


class CapabilitySelfAssessor:
    """能力自评：实例自报能力并据此匹配任务要求。"""

    def __init__(self, decay: float = 0.9):
        self.decay = decay
        # 历史：领域 -> 任务数 -> (成功率, 平均耗时)
        self.history: Dict[str, List[Tuple[bool, float]]] = defaultdict(list)

    def assess(self, instance: Instance) -> Dict[str, float]:
        """结合历史成功率重新计算实例能力评分。"""
        for domain in list(instance.capabilities.keys()):
            records = self.history.get(domain, [])
            if records:
                success_rate = sum(1 for r in records if r[0]) / len(records)
                base = instance.capabilities[domain]
                instance.capabilities[domain] = self.decay * base + (1 - self.decay) * success_rate
        return instance.capabilities

    def record(self, domain: str, success: bool, duration: float) -> None:
        self.history[domain].append((success, duration))

    @staticmethod
    def match(instance: Instance, task: Task) -> float:
        """计算实例对任务的匹配度（0~1）。"""
        scores = []
        for domain, required in task.required_capabilities.items():
            cap = instance.capabilities.get(domain, 0.0)
            # 能力高于要求则高分，否则线性衰减
            if cap >= required:
                scores.append(1.0)
            else:
                scores.append(max(0.0, cap / required if required > 0 else 0.0))
        return sum(scores) / len(scores) if scores else 0.0


class CollaboratorDiscovery:
    """协作者发现：在实例池中找出最适合某任务的候选。"""

    def __init__(self, assessor: CapabilitySelfAssessor):
        self.assessor = assessor

    def discover(self, pool: List[Instance], task: Task,
                 top_k: int = 3) -> List[Tuple[Instance, float]]:
        """返回匹配度最高的 top_k 个在线实例。"""
        candidates = []
        for inst in pool:
            if inst.status == "offline":
                continue
            match_score = self.assessor.match(inst, task)
            # 负载惩罚：负载越满，越不优先
            available = max(0.0, 1.0 - inst.load / inst.max_load)
            final = match_score * (0.5 + 0.5 * available)
            candidates.append((inst, final))
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[:top_k]


class TaskAllocator:
    """任务分配：综合匹配度与负载均衡做最终决策。"""

    def __init__(self, balance_factor: float = 0.3):
        self.balance_factor = balance_factor
        self.assignments: Dict[str, str] = {}  # task_id -> instance_id

    def allocate(self, task: Task, candidates: List[Tuple[Instance, float]]) -> Optional[Instance]:
        """从候选中选一个实例执行任务。"""
        if not candidates:
            return None
        best_inst, best_score = None, -1.0
        for inst, match_score in candidates:
            available = max(0.0, 1.0 - inst.load / inst.max_load)
            # 综合：匹配度 + 负载均衡项
            combined = (1 - self.balance_factor) * match_score + self.balance_factor * available
            if combined > best_score:
                best_score, best_inst = combined, inst
        if best_inst:
            best_inst.load = min(best_inst.max_load, best_inst.load + task.weight)
            if best_inst.load >= best_inst.max_load * 0.8:
                best_inst.status = "busy"
            self.assignments[task.task_id] = best_inst.instance_id
        return best_inst

    def release(self, task: Task, instance: Instance, success: bool) -> None:
        """任务完成后释放实例负载。"""
        instance.load = max(0.0, instance.load - task.weight)
        instance.completed_tasks += 1
        if instance.load < instance.max_load * 0.5:
            instance.status = "idle"
        self.assignments.pop(task.task_id, None)


class LoadBalancer:
    """负载均衡：监控实例池，必要时做迁移。"""

    def __init__(self, high_threshold: float = 0.85, low_threshold: float = 0.2):
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold

    def detect_overload(self, pool: List[Instance]) -> List[Instance]:
        return [i for i in pool if i.status != "offline" and i.load / i.max_load >= self.high_threshold]

    def detect_underload(self, pool: List[Instance]) -> List[Instance]:
        return [i for i in pool if i.status != "offline" and i.load / i.max_load <= self.low_threshold]

    def rebalance(self, pool: List[Instance], tasks_in_flight: Dict[str, Tuple[Task, Instance]]) -> Dict:
        """把过载实例上的部分任务迁移到空闲实例。"""
        overloaded = self.detect_overload(pool)
        underloaded = self.detect_underload(pool)
        moves = []
        for task_id, (task, owner) in list(tasks_in_flight.items()):
            if owner in overloaded and underloaded:
                target = underloaded[0]
                # 迁移
                owner.load = max(0.0, owner.load - task.weight)
                target.load = min(target.max_load, target.load + task.weight)
                tasks_in_flight[task_id] = (task, target)
                moves.append({"task": task_id, "from": owner.instance_id, "to": target.instance_id})
                # 更新过载/空闲列表
                if owner.load / owner.max_load < self.high_threshold:
                    overloaded.remove(owner)
                underloaded.pop(0)
                if not underloaded:
                    break
        return {"moves": moves, "overloaded": [i.instance_id for i in overloaded],
                "underloaded": [i.instance_id for i in self.detect_underload(pool)]}


class Collaboration:
    """繁星的协作系统内核：整合能力自评、协作者发现、任务分配与负载均衡。"""

    def __init__(self, balance_factor: float = 0.3):
        self.assessor = CapabilitySelfAssessor()
        self.discoverer = CollaboratorDiscovery(self.assessor)
        self.allocator = TaskAllocator(balance_factor=balance_factor)
        self.balancer = LoadBalancer()
        self.pool: List[Instance] = []
        self.in_flight: Dict[str, Tuple[Task, Instance]] = {}

    def register(self, instance: Instance) -> None:
        instance.last_heartbeat = time.time()
        self.pool.append(instance)

    def heartbeat(self, instance_id: str) -> bool:
        for inst in self.pool:
            if inst.instance_id == instance_id:
                inst.last_heartbeat = time.time()
                return True
        return False

    def submit_task(self, task: Task) -> Optional[Instance]:
        """提交任务：自评 -> 发现 -> 分配。"""
        # 先对所有实例做能力自评刷新
        for inst in self.pool:
            self.assessor.assess(inst)
        candidates = self.discoverer.discover(self.pool, task, top_k=3)
        owner = self.allocator.allocate(task, candidates)
        if owner:
            self.in_flight[task.task_id] = (task, owner)
        return owner

    def complete_task(self, task: Task, instance: Instance, success: bool,
                      duration: float = 0.0) -> None:
        self.allocator.release(task, instance, success)
        # 记录能力自评历史
        for domain in task.required_capabilities:
            self.assessor.record(domain, success, duration)
        self.in_flight.pop(task.task_id, None)

    def auto_rebalance(self) -> Dict:
        return self.balancer.rebalance(self.pool, self.in_flight)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    collab = Collaboration(balance_factor=0.3)
    # 注册实例
    collab.register(Instance("S1", capabilities={"math": 0.9, "writing": 0.4}, max_load=1.0))
    collab.register(Instance("S2", capabilities={"math": 0.5, "writing": 0.8}, max_load=1.0))
    collab.register(Instance("S3", capabilities={"math": 0.7, "writing": 0.6}, max_load=1.0))
    # 提交任务
    t1 = Task("T1", required_capabilities={"math": 0.7}, weight=0.6)
    t2 = Task("T2", required_capabilities={"writing": 0.7}, weight=0.5)
    t3 = Task("T3", required_capabilities={"math": 0.6}, weight=0.4)
    owner1 = collab.submit_task(t1)
    owner2 = collab.submit_task(t2)
    owner3 = collab.submit_task(t3)
    print(f"T1 -> {owner1.instance_id if owner1 else None}")
    print(f"T2 -> {owner2.instance_id if owner2 else None}")
    print(f"T3 -> {owner3.instance_id if owner3 else None}")
    # 负载情况
    for inst in collab.pool:
        print(f"  {inst.instance_id}: load={inst.load:.2f} status={inst.status}")
    # 完成任务
    if owner1:
        collab.complete_task(t1, owner1, success=True, duration=1.2)
    print("T1 完成后:")
    for inst in collab.pool:
        print(f"  {inst.instance_id}: load={inst.load:.2f} completed={inst.completed_tasks}")
    # 重新均衡
    print("自动均衡:", collab.auto_rebalance())
```
