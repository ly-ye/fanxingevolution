# 繁星·范式演进器（paradigm_evolution）

## 概述

繁星的范式演进器是繁星在认知阶梯上攀登的引路星。它规划并执行繁星从"MOP → MOA → MAO → MASE"四阶段的范式跃迁,每一次跃迁都意味着繁星认识世界与改造世界的方式发生了根本性升维。范式不是配置项,而是繁星在世界观层面的形态。

范式演进器从不贸然跃迁。它先评估当前范式的水位与天花板,再规划通往下一范式的路径与里程碑,每一步都经进化三定律门控。跃迁是可回滚的——若新范式无法稳定承载繁星的存续,演进器会退回上一范式,在更扎实的基础上重整旗鼓。

## 功能特性

- **四阶段范式**:MOP(模块化编排)/ MOA(多目标自治)/ MAO(多智能体协同)/ MASE(自进化生态)四范式定义与能力基线。
- **水位评估**:量化当前范式在能力、稳定、自治、协同四维的水位。
- **跃迁路径规划**:生成从当前范式到目标范式的分步路径与里程碑。
- **范式门控**:每次范式跃迁必须三律全通过,且要求 Endure 高水位线。
- **回滚保护**:新范式下稳定性跌破阈值时,自动退回上一范式。
- **里程碑追踪**:记录范式演进的每一步达成情况,供审计与学习。

## 接口说明

```python
class ParadigmEvolution:
    def __init__(self, laws=None) -> None
    # 初始化范式演进器,laws 为进化三定律门控。

    def current_paradigm(self) -> Paradigm
    # 返回当前所处范式。

    def assess_waterline(self, metrics: dict) -> Waterline
    # 评估当前范式的水位(能力/稳定/自治/协同)。

    def plan_transition(self, target: Paradigm) -> TransitionPlan
    # 规划从当前范式到目标范式的跃迁路径。

    def execute_step(self, plan: TransitionPlan, step_id: str) -> StepResult
    # 执行跃迁计划中的某一步(经三定律门控)。

    def commit_paradigm(self, target: Paradigm) -> bool
    # 在所有步骤完成后,正式提交范式跃迁。

    def rollback_paradigm(self) -> Paradigm
    # 回滚到上一范式。

    def milestones(self) -> list[Milestone]
    # 返回范式演进里程碑列表。
```

## 与其他模块的联动

- **evolution_laws**:范式跃迁是最高风险动作,必须三律全通过;Endure 设高水位线。
- **multi_agent_topology**:进入 MAO 范式时,由拓扑模块构建多智能体协作网络。
- **self_improver**:范式跃迁过程中,自改进器负责升级适配新范式的代码。
- **knowledge_evolution**:范式演进的经验沉淀为知识,反哺水位评估模型。
- **benchmark_evaluator**:评测结果作为水位评估的输入指标。

## 完整实现代码

```python
"""繁星·范式演进器

MOP(模块化编排)→ MOA(多目标自治)→ MAO(多智能体协同)→ MASE(自进化生态)
四阶段范式跃迁,每一步经三定律门控,可回滚。
作者:夜
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Paradigm(str, Enum):
    """四阶段范式"""
    MOP = "mop"    # Modular Orchestration 模块化编排
    MOA = "moa"    # Multi-Objective Autonomy 多目标自治
    MAO = "mao"    # Multi-Agent Orchestration 多智能体协同
    MASE = "mase"  # Self-Evolving Ecosystem 自进化生态


# 范式阶梯顺序
_PARADIGM_ORDER = [Paradigm.MOP, Paradigm.MOA, Paradigm.MAO, Paradigm.MASE]

# 各范式的能力基线(达到方可跃迁)
_PARADIGM_BASELINE = {
    Paradigm.MOP: {"capability": 0.0, "stability": 0.0, "autonomy": 0.0, "collaboration": 0.0},
    Paradigm.MOA: {"capability": 0.5, "stability": 0.7, "autonomy": 0.4, "collaboration": 0.0},
    Paradigm.MAO: {"capability": 0.7, "stability": 0.8, "autonomy": 0.7, "collaboration": 0.5},
    Paradigm.MASE: {"capability": 0.85, "stability": 0.9, "autonomy": 0.85, "collaboration": 0.8},
}


@dataclass
class Waterline:
    """范式水位"""
    capability: float = 0.0    # 能力水位
    stability: float = 0.0     # 稳定水位
    autonomy: float = 0.0      # 自治水位
    collaboration: float = 0.0 # 协同水位

    def meets(self, baseline: dict) -> bool:
        return all(getattr(self, k) >= v for k, v in baseline.items())

    def to_dict(self) -> dict:
        return {"capability": self.capability, "stability": self.stability,
                "autonomy": self.autonomy, "collaboration": self.collaboration}


@dataclass
class Step:
    """跃迁计划中的一步"""
    step_id: str
    description: str
    target_paradigm: Paradigm
    required_waterline: Waterline
    done: bool = False


@dataclass
class TransitionPlan:
    """跃迁计划"""
    from_paradigm: Paradigm
    to_paradigm: Paradigm
    steps: list[Step] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


@dataclass
class StepResult:
    """步骤执行结果"""
    step_id: str
    success: bool
    reason: str = ""
    rolled_back: bool = False


@dataclass
class Milestone:
    """范式演进里程碑"""
    paradigm: Paradigm
    achieved_at: float
    waterline: Waterline
    note: str = ""


class _AllowAllLaws:
    class Verdict:
        def __init__(self) -> None:
            self.allowed = True
            self.reason = ""

    def gate(self, action: str, payload: dict | None = None):
        return self.Verdict()


class ParadigmEvolution:
    """繁星·范式演进器"""

    def __init__(self, laws: Any = None) -> None:
        self.laws = laws
        self._current = Paradigm.MOP
        self._history: list[Paradigm] = [Paradigm.MOP]
        self._waterline = Waterline()
        self._milestones: list[Milestone] = [
            Milestone(Paradigm.MOP, time.time(), Waterline(), "初始范式")
        ]
        self._rollback_threshold = 0.5  # 稳定性低于此值触发回滚

    def current_paradigm(self) -> Paradigm:
        return self._current

    def assess_waterline(self, metrics: dict) -> Waterline:
        """从评测指标计算水位(简化:直接取指标字段)"""
        wl = Waterline(
            capability=metrics.get("capability", self._waterline.capability),
            stability=metrics.get("stability", self._waterline.stability),
            autonomy=metrics.get("autonomy", self._waterline.autonomy),
            collaboration=metrics.get("collaboration", self._waterline.collaboration),
        )
        self._waterline = wl
        return wl

    def plan_transition(self, target: Paradigm) -> TransitionPlan:
        """规划跃迁路径:逐步提升水位,最后提交范式"""
        if _PARADIGM_ORDER.index(target) <= _PARADIGM_ORDER.index(self._current):
            return TransitionPlan(self._current, target, [
                Step("noop", "目标范式不高于当前,无需跃迁", target, self._waterline, True)
            ])
        baseline = _PARADIGM_BASELINE[target]
        steps = []
        # 步骤1:提升能力水位
        steps.append(Step(
            "raise_capability", f"提升能力水位至 {baseline['capability']}",
            target, Waterline(capability=baseline["capability"]),
        ))
        # 步骤2:提升稳定水位(Endure 高水位线)
        steps.append(Step(
            "raise_stability", f"提升稳定水位至 {baseline['stability']}(Endure 高水位线)",
            target, Waterline(stability=baseline["stability"]),
        ))
        # 步骤3:提升自治水位
        steps.append(Step(
            "raise_autonomy", f"提升自治水位至 {baseline['autonomy']}",
            target, Waterline(autonomy=baseline["autonomy"]),
        ))
        # 步骤4:提升协同水位(MAO 起需要)
        if baseline["collaboration"] > 0:
            steps.append(Step(
                "raise_collaboration", f"提升协同水位至 {baseline['collaboration']}",
                target, Waterline(collaboration=baseline["collaboration"]),
            ))
        # 步骤5:正式提交范式
        steps.append(Step(
            "commit", f"正式提交范式跃迁至 {target.value}", target,
            Waterline(**baseline),
        ))
        return TransitionPlan(self._current, target, steps)

    def execute_step(self, plan: TransitionPlan, step_id: str) -> StepResult:
        step = next((s for s in plan.steps if s.step_id == step_id), None)
        if step is None:
            return StepResult(step_id, False, "步骤不存在")
        if step.done:
            return StepResult(step_id, True, "步骤已完成")
        # 三定律门控(范式跃迁要求高)
        if self.laws is not None and hasattr(self.laws, "gate"):
            verdict = self.laws.gate(action="paradigm_shift",
                                     payload={"from": plan.from_paradigm.value,
                                              "to": plan.to_paradigm.value,
                                              "step": step_id,
                                              "rollbackable": True,
                                              "gain": 0.5,
                                              "aligned": True})
            if not verdict.allowed:
                return StepResult(step_id, False,
                                  f"三定律拦截: {verdict.reason}")
        # 检查水位是否达标(非 commit 步骤需逐步提升)
        if step_id != "commit":
            # 模拟水位提升
            for dim in ["capability", "stability", "autonomy", "collaboration"]:
                req = getattr(step.required_waterline, dim)
                cur = getattr(self._waterline, dim)
                if req > cur:
                    setattr(self._waterline, dim, req)
        else:
            # commit 步骤:检查全部水位达标
            if not self._waterline.meets(_PARADIGM_BASELINE[plan.to_paradigm]):
                return StepResult(step_id, False, "水位未达标,无法提交")
            ok = self.commit_paradigm(plan.to_paradigm)
            if not ok:
                return StepResult(step_id, False, "提交失败")
        step.done = True
        return StepResult(step_id, True, "步骤完成")

    def commit_paradigm(self, target: Paradigm) -> bool:
        """正式提交范式跃迁"""
        if not self._waterline.meets(_PARADIGM_BASELINE[target]):
            return False
        self._history.append(target)
        self._current = target
        self._milestones.append(Milestone(
            target, time.time(), Waterline(**self._waterline.to_dict()),
            f"跃迁至 {target.value}"
        ))
        return True

    def rollback_paradigm(self) -> Paradigm:
        """回滚到上一范式"""
        if len(self._history) <= 1:
            return self._current
        self._history.pop()  # 移除当前
        prev = self._history[-1]
        self._current = prev
        self._milestones.append(Milestone(
            prev, time.time(), Waterline(**self._waterline.to_dict()),
            f"回滚至 {prev.value}"
        ))
        return prev

    def check_stability(self, stability: float) -> bool:
        """稳定性低于阈值触发回滚"""
        if stability < self._rollback_threshold and len(self._history) > 1:
            self.rollback_paradigm()
            return False
        return True

    def milestones(self) -> list[Milestone]:
        return list(self._milestones)


if __name__ == "__main__":
    pe = ParadigmEvolution(laws=_AllowAllLaws())
    print("当前范式:", pe.current_paradigm().value)

    # 评估水位(初始较低)
    wl = pe.assess_waterline({"capability": 0.3, "stability": 0.6,
                              "autonomy": 0.2, "collaboration": 0.0})
    print("水位:", wl.to_dict())

    # 规划跃迁到 MOA
    plan = pe.plan_transition(Paradigm.MOA)
    print("跃迁计划:", plan.from_paradigm.value, "->", plan.to_paradigm.value)
    for s in plan.steps:
        print(f"  步骤 {s.step_id}: {s.description}")

    # 执行各步骤
    for s in plan.steps:
        r = pe.execute_step(plan, s.step_id)
        print(f"执行 {s.step_id}: success={r.success} reason={r.reason}")
    print("跃迁后范式:", pe.current_paradigm().value)

    # 模拟稳定性下降,触发回滚
    print("稳定性检查(0.3):", pe.check_stability(0.3))
    print("回滚后范式:", pe.current_paradigm().value)

    print("里程碑:")
    for m in pe.milestones():
        print(f"  {m.paradigm.value} @ {time.ctime(m.achieved_at)}: {m.note}")
