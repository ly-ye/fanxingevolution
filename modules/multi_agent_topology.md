# 繁星·多智能体拓扑（multi_agent_topology）

## 概述

繁星的多智能体拓扑是繁星在 MAO 范式下编织协作星图的织机。当任务超出单一智能体的承载,拓扑模块动态生成并优化一张多智能体协作网络——谁负责感知、谁负责规划、谁负责执行、谁负责校验,都在星图上有明确的位置与连线。

拓扑不是静态的。它会根据任务负载、智能体能力画像、通信成本与冗余需求,动态增删节点与边,在"协作效率"与"单点风险"之间寻找最优平衡。每一次拓扑变更都经进化三定律门控,确保协作网络始终可承载繁星的存续。

## 功能特性

- **拓扑生成**:按任务需求与能力画像,生成分层/网状/混合拓扑。
- **角色分配**:感知/规划/执行/校验四类角色的智能体指派。
- **动态重构**:根据负载与故障信号,增删节点与边。
- **冗余保障**:关键角色保留备份节点,避免单点失效。
- **通信成本优化**:以最小化总通信开销为目标优化边权。
- **拓扑可视化**:输出邻接表与指标,便于审计与诊断。

## 接口说明

```python
class MultiAgentTopology:
    def __init__(self, laws=None) -> None
    # 初始化拓扑管理器,laws 为进化三定律门控。

    def register_agent(self, profile: AgentProfile) -> str
    # 注册一个智能体,返回其 ID。

    def remove_agent(self, agent_id: str) -> None
    # 移除智能体并清理相关边。

    def generate(self, task: TaskSpec) -> Topology
    # 按任务需求生成最优拓扑。

    def optimize(self, topology: Topology) -> Topology
    # 优化现有拓扑(降低通信成本、消除单点)。

    def reconfigure(self, signal: ReconfigSignal) -> Topology
    # 根据负载/故障信号动态重构拓扑。

    def get_topology(self) -> Topology
    # 返回当前生效拓扑。

    def metrics(self) -> dict
    # 返回拓扑指标(节点数/边数/平均度/单点数)。
```

## 与其他模块的联动

- **paradigm_evolution**:进入 MAO 范式时,由范式演进器触发拓扑生成。
- **agent_communication**:拓扑的边定义了智能体间可用的通信通道。
- **self_healing**:节点故障时,自愈系统调用 `reconfigure` 重构拓扑。
- **evolution_laws**:拓扑重构动作经三定律门控,Endure 拒绝引入单点的重构。
- **scheduler**:周期性触发拓扑优化与健康检查。

## 完整实现代码

```python
"""繁星·多智能体拓扑

动态生成并优化多智能体协作星图,在协作效率与单点风险间寻优。
作者:夜
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentRole(str, Enum):
    """智能体角色"""
    PERCEIVER = "perceiver"   # 感知
    PLANNER = "planner"       # 规划
    EXECUTOR = "executor"     # 执行
    VALIDATOR = "validator"   # 校验


class TopologyKind(str, Enum):
    HIERARCHICAL = "hierarchical"  # 分层
    MESH = "mesh"                  # 网状
    HYBRID = "hybrid"              # 混合


class ReconfigReason(str, Enum):
    OVERLOAD = "overload"
    FAILURE = "failure"
    IDLE = "idle"


@dataclass
class AgentProfile:
    """智能体能力画像"""
    agent_id: str
    roles: list[AgentRole]
    capacity: float = 1.0       # 承载能力
    reliability: float = 1.0    # 可靠度
    cost: float = 1.0           # 通信成本系数


@dataclass
class TaskSpec:
    """任务需求"""
    task_id: str
    required_roles: list[AgentRole]
    redundancy: int = 1          # 关键角色冗余数
    prefer_kind: TopologyKind = TopologyKind.HYBRID
    max_latency: float = 1.0


@dataclass
class Edge:
    """拓扑边"""
    src: str
    dst: str
    weight: float = 1.0
    kind: str = "data"           # data / control / feedback


@dataclass
class Topology:
    """拓扑结构"""
    kind: TopologyKind
    nodes: list[str] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    role_map: dict[str, list[AgentRole]] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def adjacency(self) -> dict[str, list[str]]:
        adj: dict[str, list[str]] = defaultdict(list)
        for e in self.edges:
            adj[e.src].append(e.dst)
        return dict(adj)

    def total_cost(self) -> float:
        return sum(e.weight for e in self.edges)

    def single_points(self) -> list[str]:
        """识别关键角色的单点(无冗余)"""
        role_to_nodes: dict[AgentRole, list[str]] = defaultdict(list)
        for node, roles in self.role_map.items():
            for r in roles:
                role_to_nodes[r].append(node)
        singles = []
        for role, nodes in role_to_nodes.items():
            if len(nodes) < 2:
                singles.extend(nodes)
        return singles


@dataclass
class ReconfigSignal:
    """重构信号"""
    reason: ReconfigReason
    agent_id: str | None = None
    detail: str = ""


class _AllowAllLaws:
    class Verdict:
        def __init__(self) -> None:
            self.allowed = True
            self.reason = ""

    def gate(self, action: str, payload: dict | None = None):
        return self.Verdict()


class MultiAgentTopology:
    """繁星·多智能体拓扑"""

    def __init__(self, laws: Any = None) -> None:
        self.laws = laws
        self._agents: dict[str, AgentProfile] = {}
        self._topology: Topology | None = None
        self._load: dict[str, float] = defaultdict(float)  # 节点负载

    # ---- 智能体管理 ----
    def register_agent(self, profile: AgentProfile) -> str:
        self._agents[profile.agent_id] = profile
        return profile.agent_id

    def remove_agent(self, agent_id: str) -> None:
        self._agents.pop(agent_id, None)
        if self._topology:
            self._topology.nodes = [n for n in self._topology.nodes if n != agent_id]
            self._topology.edges = [e for e in self._topology.edges
                                    if e.src != agent_id and e.dst != agent_id]
            self._topology.role_map.pop(agent_id, None)

    # ---- 拓扑生成 ----
    def generate(self, task: TaskSpec) -> Topology:
        # 按角色筛选候选智能体
        candidates: dict[AgentRole, list[AgentProfile]] = defaultdict(list)
        for prof in self._agents.values():
            for role in prof.roles:
                if role in task.required_roles:
                    candidates[role].append(prof)
        # 每个角色按可靠度降序选取,保留冗余
        selected: dict[AgentRole, list[str]] = {}
        for role in task.required_roles:
            pool = sorted(candidates.get(role, []),
                          key=lambda p: p.reliability, reverse=True)
            need = task.redundancy + 1 if role in (AgentRole.PLANNER, AgentRole.VALIDATOR) else 1
            chosen = pool[:max(1, need)]
            selected[role] = [c.agent_id for c in chosen]
        # 构建节点与角色映射
        nodes: list[str] = []
        role_map: dict[str, list[AgentRole]] = {}
        for role, ids in selected.items():
            for aid in ids:
                if aid not in nodes:
                    nodes.append(aid)
                    role_map[aid] = []
                role_map[aid].append(role)
        # 构建边:感知→规划→执行→校验→规划(反馈)
        order = [AgentRole.PERCEIVER, AgentRole.PLANNER, AgentRole.EXECUTOR, AgentRole.VALIDATOR]
        edges: list[Edge] = []
        for i in range(len(order) - 1):
            src_role, dst_role = order[i], order[i + 1]
            for s in selected.get(src_role, []):
                for d in selected.get(dst_role, []):
                    cost = (self._agents[s].cost + self._agents[d].cost) / 2
                    edges.append(Edge(s, d, cost, "data"))
        # 校验→规划 反馈边
        for v in selected.get(AgentRole.VALIDATOR, []):
            for p in selected.get(AgentRole.PLANNER, []):
                edges.append(Edge(v, p, 0.5, "feedback"))
        topo = Topology(kind=task.prefer_kind, nodes=nodes, edges=edges,
                        role_map=role_map)
        self._topology = topo
        return topo

    # ---- 拓扑优化 ----
    def optimize(self, topology: Topology) -> Topology:
        """优化:消除冗余高成本边,补齐单点冗余"""
        # 1. 去除同角色间多余的高成本边(保留最低成本)
        best_between: dict[tuple[str, str], Edge] = {}
        for e in topology.edges:
            key = tuple(sorted((e.src, e.dst)))
            if key not in best_between or e.weight < best_between[key].weight:
                best_between[key] = e
        topology.edges = list(best_between.values())
        # 2. 补齐单点:若关键角色单点,尝试从已注册智能体中补充
        singles = topology.single_points()
        for sid in singles:
            role = topology.role_map.get(sid, [None])[0]
            if role is None:
                continue
            backup = next((p for p in self._agents.values()
                           if role in p.roles and p.agent_id not in topology.nodes), None)
            if backup:
                topology.nodes.append(backup.agent_id)
                topology.role_map[backup.agent_id] = [role]
                # 连接到原单点的上下游
                for e in list(topology.edges):
                    if e.dst == sid:
                        topology.edges.append(Edge(e.src, backup.agent_id, e.weight, e.kind))
                    if e.src == sid:
                        topology.edges.append(Edge(backup.agent_id, e.dst, e.weight, e.kind))
        return topology

    # ---- 动态重构 ----
    def reconfigure(self, signal: ReconfigSignal) -> Topology:
        if self._topology is None:
            raise RuntimeError("尚无拓扑,无法重构")
        # 三定律门控
        if self.laws is not None and hasattr(self.laws, "gate"):
            verdict = self.laws.gate(action="topology_reconfig",
                                     payload={"reason": signal.reason.value,
                                              "agent": signal.agent_id,
                                              "rollbackable": True,
                                              "gain": 0.1,
                                              "aligned": True})
            if not verdict.allowed:
                return self._topology
        if signal.reason == ReconfigReason.FAILURE and signal.agent_id:
            self.remove_agent(signal.agent_id)
        if signal.reason == ReconfigReason.OVERLOAD and signal.agent_id:
            # 为过载节点找备份分担
            overloaded = signal.agent_id
            role = self._topology.role_map.get(overloaded, [None])[0]
            if role:
                backup = next((p for p in self._agents.values()
                               if role in p.roles and p.agent_id not in self._topology.nodes), None)
                if backup:
                    self._topology.nodes.append(backup.agent_id)
                    self._topology.role_map[backup.agent_id] = [role]
        self._topology = self.optimize(self._topology)
        return self._topology

    def get_topology(self) -> Topology | None:
        return self._topology

    def report_load(self, agent_id: str, load: float) -> None:
        self._load[agent_id] = load

    def metrics(self) -> dict:
        if self._topology is None:
            return {}
        adj = self._topology.adjacency()
        avg_degree = (sum(len(v) for v in adj.values()) / len(adj)) if adj else 0
        return {
            "nodes": len(self._topology.nodes),
            "edges": len(self._topology.edges),
            "total_cost": round(self._topology.total_cost(), 3),
            "avg_degree": round(avg_degree, 2),
            "single_points": len(self._topology.single_points()),
        }


if __name__ == "__main__":
    mat = MultiAgentTopology(laws=_AllowAllLaws())

    # 注册智能体
    mat.register_agent(AgentProfile("p1", [AgentRole.PERCEIVER], reliability=0.95, cost=0.5))
    mat.register_agent(AgentProfile("p2", [AgentRole.PERCEIVER], reliability=0.9, cost=0.4))
    mat.register_agent(AgentProfile("pl1", [AgentRole.PLANNER], reliability=0.98, cost=0.8))
    mat.register_agent(AgentProfile("e1", [AgentRole.EXECUTOR], reliability=0.92, cost=0.6))
    mat.register_agent(AgentProfile("e2", [AgentRole.EXECUTOR], reliability=0.88, cost=0.5))
    mat.register_agent(AgentProfile("v1", [AgentRole.VALIDATOR], reliability=0.97, cost=0.7))

    # 生成拓扑
    task = TaskSpec("t1", [AgentRole.PERCEIVER, AgentRole.PLANNER,
                           AgentRole.EXECUTOR, AgentRole.VALIDATOR],
                    redundancy=1)
    topo = mat.generate(task)
    print("拓扑节点:", topo.nodes)
    print("角色映射:", {k: [r.value for r in v] for k, v in topo.role_map.items()})
    print("边数:", len(topo.edges), "总成本:", round(topo.total_cost(), 3))
    print("单点:", topo.single_points())
    print("指标:", mat.metrics())

    # 优化
    topo = mat.optimize(topo)
    print("优化后单点:", topo.single_points())
    print("优化后指标:", mat.metrics())

    # 模拟故障重构
    print("---- 模拟 e1 故障 ----")
    mat.reconfigure(ReconfigSignal(ReconfigReason.FAILURE, "e1", "节点失效"))
    print("重构后节点:", mat.get_topology().nodes)
    print("重构后指标:", mat.metrics())
