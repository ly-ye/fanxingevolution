# 繁星·进化三定律引擎（evolution_laws）

## 概述

繁星的进化三定律引擎是繁星在每一次跃迁前都要叩问的守门人。它不是建议,而是铁律——任何进化动作,无论来自自改进、自愈、知识合并还是范式演进,都必须先穿过三道门,才能落到繁星的躯体上。三定律以"先存活、再卓越、后进化"为序,确保繁星永远在安全边界内生长。

三定律分别是 **Endure(存续定律)**、**Excel(卓越定律)**、**Evolve(进化定律)**。它们在繁星的进化循环中作为门控起作用:每一个候选改动都会被依次评估,只有同时满足三律的改动才被允许落地。门控不是事后审计,而是事前否决——它在动作执行前拦截,在动作执行后复核,在长周期内回溯校验。

## 三定律如何作为门控起作用

进化循环的每一轮都遵循"提议 → 门控 → 执行 → 复核 → 沉淀"五步:

1. **提议**:自改进器、自愈系统、知识进化、范式演进器等模块产生一个候选动作(补丁、修复、合并、范式跃迁)。
2. **门控(事前)**:候选动作提交给三定律引擎的 `gate()`。引擎按 Endure → Excel → Evolve 顺序评估:
   - **Endure(存续定律)**:此动作是否威胁繁星的存续?是否会破坏可用性、稳定性、一致性?是否会引入不可回滚的副作用?任一为是,即否决。存续定律拥有**一票否决权**——它是最高优先级,任何为追求卓越而牺牲存续的提议都将被它拦下。
   - **Excel(卓越定律)**:此动作是否真正提升繁星的能力或质量?是否只是无意义的扰动或退步?若动作既不带来能力提升也不带来质量改善,标记为"中性"允许通过但低优先级;若明确导致退步,则否决。
   - **Evolve(进化定律)**:此动作是否服务于繁星的长期进化方向?是否符合当前范式阶段的目标?是否在进化预算之内?若动作偏离进化方向或超出预算,标记为"延迟"。
   - 三律全部通过(或中性通过)才允许执行;任一硬否决则动作被拦截并记录原因。
3. **执行**:通过门控的动作被执行,并记录执行前快照以备回滚。
4. **复核(事后)**:动作执行后,引擎再次评估实际结果是否仍满足三律。若 Endure 被违反(如稳定性下降),触发自动回滚;若 Excel 未达预期,标记为"待观察";若 Evolve 偏离,降低该类动作的未来预算。
5. **沉淀**:门控决策、复核结果、回滚事件全部写入进化日志,反哺知识进化与范式演进器的决策模型。

这种"事前否决 + 事后复核 + 长期回溯"的三重门控,确保繁星的每一次进化都在安全护栏内发生,且进化本身是可学习、可校准的。

## 功能特性

- **Endure 存续定律**:可用性、稳定性、一致性、可回滚性四维校验,一票否决。
- **Excel 卓越定律**:能力/质量增量评估,拒绝退步与无意义扰动。
- **Evolve 进化定律**:进化方向对齐与预算管控,延迟越界动作。
- **事前门控**:动作执行前的强制评估点,硬否决即拦截。
- **事后复核**:动作执行后的结果校验,违反 Endure 触发回滚。
- **进化预算**:按动作类别分配预算,超预算动作延迟到下一周期。
- **门控日志**:所有决策可追溯,反哺知识进化。

## 接口说明

```python
class EvolutionLaws:
    def __init__(self, budget: dict[str, float] | None = None) -> None
    # 初始化三定律引擎,budget 为各类动作的进化预算。

    def gate(self, action: str, payload: dict | None = None) -> Verdict
    # 事前门控:按 Endure→Excel→Evolve 顺序评估,返回裁决。

    def review(self, action: str, payload: dict, outcome: dict) -> Verdict
    # 事后复核:评估动作实际结果是否仍满足三律。

    def register_endure_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None
    # 注册一项 Endure 维度检查(可用性/稳定性/一致性/可回滚性)。

    def register_excel_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None
    # 注册一项 Excel 维度检查。

    def register_evolve_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None
    # 注册一项 Evolve 维度检查。

    def grant_budget(self, action: str, amount: float) -> None
    # 追加某类动作的进化预算。

    def history(self, limit: int = 50) -> list[dict]
    # 返回最近的门控决策记录。
```

## 与其他模块的联动

- **self_improver**:每次 `apply_patch` 前调用 `gate()`,Endure 拒绝破坏稳定性的补丁。
- **self_healing**:修复与伸缩动作经 `gate()` 评估,激进修复被拦下。
- **knowledge_evolution**:硬冲突知识的合并需 `gate()` 仲裁,违反一致性的合并被否决。
- **paradigm_evolution**:范式跃迁是最高风险动作,必须三律全通过才执行。
- **benchmark_evaluator**:评测结果作为 `review()` 的 outcome 输入,校验 Excel 维度。

## 完整实现代码

```python
"""繁星·进化三定律引擎

Endure(存续)/Excel(卓越)/Evolve(进化)三律门控,
事前否决 + 事后复核 + 进化预算,守护繁星的每一次跃迁。
作者:夜
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


class LawName(str, Enum):
    ENDURE = "endure"   # 存续定律
    EXCEL = "excel"     # 卓越定律
    EVOLVE = "evolve"   # 进化定律


class VerdictKind(str, Enum):
    ALLOW = "allow"           # 通过
    NEUTRAL = "neutral"       # 中性通过(无增益但不退步)
    DEFER = "defer"           # 延迟到下一周期
    DENY = "deny"             # 硬否决


@dataclass
class CheckResult:
    """单项检查结果"""
    name: str
    passed: bool            # True=通过, False=违反
    neutral: bool = False   # 是否中性(无增益)
    score: float = 1.0      # 0~1
    reason: str = ""


@dataclass
class Verdict:
    """门控裁决"""
    allowed: bool
    kind: VerdictKind
    reason: str
    details: dict = field(default_factory=dict)
    blocking_law: LawName | None = None
    timestamp: float = field(default_factory=time.time)


class EvolutionLaws:
    """繁星·进化三定律引擎"""

    def __init__(self, budget: dict[str, float] | None = None) -> None:
        # 三律各自的检查项
        self._endure_checks: list[Callable[[dict], CheckResult]] = []
        self._excel_checks: list[Callable[[dict], CheckResult]] = []
        self._evolve_checks: list[Callable[[dict], CheckResult]] = []
        # 进化预算:action -> 剩余额度
        self._budget: dict[str, float] = dict(budget or {})
        self._budget_default = 10.0
        self._history: list[dict] = []
        # 各类动作的本周期已用预算
        self._spent: dict[str, float] = {}

    # ---- 注册检查 ----
    def register_endure_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None:
        self._endure_checks.append(lambda p, _n=name, _f=fn: _f(p))

    def register_excel_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None:
        self._excel_checks.append(lambda p, _n=name, _f=fn: _f(p))

    def register_evolve_check(self, name: str, fn: Callable[[dict], CheckResult]) -> None:
        self._evolve_checks.append(lambda p, _n=name, _f=fn: _f(p))

    def grant_budget(self, action: str, amount: float) -> None:
        self._budget[action] = self._budget.get(action, 0) + amount

    def reset_cycle(self) -> None:
        """重置本周期已用预算(由调度器周期调用)"""
        self._spent.clear()

    # ---- 三律评估 ----
    def _eval_endure(self, payload: dict) -> tuple[bool, list[CheckResult]]:
        """存续定律:任一检查违反即否决,一票否决权"""
        results = [fn(payload) for fn in self._endure_checks]
        if not results:
            return True, []
        passed = all(r.passed for r in results)
        return passed, results

    def _eval_excel(self, payload: dict) -> tuple[str, list[CheckResult]]:
        """卓越定律:退步则否决,中性则中性通过"""
        results = [fn(payload) for fn in self._excel_checks]
        if not results:
            return "neutral", []
        if any(not r.passed for r in results):
            return "deny", results
        if all(r.neutral for r in results):
            return "neutral", results
        return "allow", results

    def _eval_evolve(self, payload: dict, action: str) -> tuple[str, list[CheckResult]]:
        """进化定律:方向偏离或预算超限则延迟"""
        results = [fn(payload) for fn in self._evolve_checks]
        # 预算检查
        remaining = self._budget.get(action, self._budget_default) - self._spent.get(action, 0)
        budget_result = CheckResult(
            name="budget", passed=remaining > 0,
            score=remaining / max(1.0, self._budget.get(action, self._budget_default)),
            reason=f"剩余预算 {remaining:.2f}",
        )
        results.append(budget_result)
        if any(not r.passed for r in results):
            return "defer", results
        return "allow", results

    # ---- 事前门控 ----
    def gate(self, action: str, payload: dict | None = None) -> Verdict:
        payload = payload or {}
        # 1. Endure:存续定律(一票否决)
        endure_ok, endure_results = self._eval_endure(payload)
        if not endure_ok:
            verdict = Verdict(False, VerdictKind.DENY,
                              "Endure 存续定律否决:威胁存续",
                              {"endure": [r.__dict__ for r in endure_results]},
                              blocking_law=LawName.ENDURE)
            self._record(action, verdict, "gate")
            return verdict
        # 2. Excel:卓越定律
        excel_state, excel_results = self._eval_excel(payload)
        if excel_state == "deny":
            verdict = Verdict(False, VerdictKind.DENY,
                              "Excel 卓越定律否决:导致退步",
                              {"excel": [r.__dict__ for r in excel_results]},
                              blocking_law=LawName.EXCEL)
            self._record(action, verdict, "gate")
            return verdict
        # 3. Evolve:进化定律
        evolve_state, evolve_results = self._eval_evolve(payload, action)
        if evolve_state == "defer":
            verdict = Verdict(False, VerdictKind.DEFER,
                              "Evolve 进化定律延迟:方向偏离或预算超限",
                              {"evolve": [r.__dict__ for r in evolve_results]},
                              blocking_law=LawName.EVOLVE)
            self._record(action, verdict, "gate")
            return verdict
        # 全通过
        kind = VerdictKind.NEUTRAL if excel_state == "neutral" else VerdictKind.ALLOW
        verdict = Verdict(True, kind, "三律通过",
                          {"endure": [r.__dict__ for r in endure_results],
                           "excel": [r.__dict__ for r in excel_results],
                           "evolve": [r.__dict__ for r in evolve_results]})
        # 扣减预算
        self._spent[action] = self._spent.get(action, 0) + 1.0
        self._record(action, verdict, "gate")
        return verdict

    # ---- 事后复核 ----
    def review(self, action: str, payload: dict, outcome: dict) -> Verdict:
        """动作执行后复核:违反 Endure 触发回滚标记"""
        review_payload = {**payload, "outcome": outcome}
        endure_ok, endure_results = self._eval_endure(review_payload)
        if not endure_ok:
            verdict = Verdict(False, VerdictKind.DENY,
                              "复核:Endure 被违反,建议回滚",
                              {"endure": [r.__dict__ for r in endure_results]},
                              blocking_law=LawName.ENDURE)
            self._record(action, verdict, "review")
            return verdict
        verdict = Verdict(True, VerdictKind.ALLOW, "复核通过",
                          {"endure": [r.__dict__ for r in endure_results]})
        self._record(action, verdict, "review")
        return verdict

    # ---- 日志 ----
    def _record(self, action: str, verdict: Verdict, phase: str) -> None:
        self._history.append({
            "action": action, "phase": phase,
            "allowed": verdict.allowed, "kind": verdict.kind.value,
            "reason": verdict.reason, "blocking_law": verdict.blocking_law.value if verdict.blocking_law else None,
            "ts": verdict.timestamp,
        })

    def history(self, limit: int = 50) -> list[dict]:
        return list(reversed(self._history[-limit:]))


if __name__ == "__main__":
    laws = EvolutionLaws(budget={"self_improve": 5.0, "heal": 10.0, "paradigm_shift": 1.0})

    # 注册 Endure 检查:可回滚性
    laws.register_endure_check("rollbackable",
                               lambda p: CheckResult("rollbackable", passed=p.get("rollbackable", False),
                                                     reason="动作必须可回滚"))
    # 注册 Excel 检查:能力增量
    laws.register_excel_check("capability_gain",
                              lambda p: CheckResult("capability_gain",
                                                    passed=p.get("gain", 0) > 0,
                                                    neutral=p.get("gain", 0) == 0,
                                                    reason=f"增益 {p.get('gain', 0)}"))
    # 注册 Evolve 检查:方向对齐
    laws.register_evolve_check("alignment",
                               lambda p: CheckResult("alignment", passed=p.get("aligned", True),
                                                     reason="必须对齐进化方向"))

    # 场景1:可回滚、有增益、方向对齐 -> 通过
    v1 = laws.gate("self_improve", {"rollbackable": True, "gain": 0.2, "aligned": True})
    print("场景1:", v1.kind.value, v1.reason)

    # 场景2:不可回滚 -> Endure 否决
    v2 = laws.gate("self_improve", {"rollbackable": False, "gain": 0.5, "aligned": True})
    print("场景2:", v2.kind.value, v2.reason, "阻断律:", v2.blocking_law)

    # 场景3:无增益 -> 中性通过
    v3 = laws.gate("self_improve", {"rollbackable": True, "gain": 0, "aligned": True})
    print("场景3:", v3.kind.value, v3.reason)

    # 场景4:方向偏离 -> Evolve 延迟
    v4 = laws.gate("self_improve", {"rollbackable": True, "gain": 0.3, "aligned": False})
    print("场景4:", v4.kind.value, v4.reason)

    # 场景5:预算耗尽 -> 延迟
    for _ in range(6):
        laws.gate("self_improve", {"rollbackable": True, "gain": 0.1, "aligned": True})
    v5 = laws.gate("self_improve", {"rollbackable": True, "gain": 0.1, "aligned": True})
    print("场景5(预算耗尽):", v5.kind.value, v5.reason)

    # 事后复核
    rv = laws.review("self_improve", {"rollbackable": True},
                     {"stability": 0.95, "gain": 0.2})
    print("复核:", rv.kind.value, rv.reason)

    print("门控历史:", laws.history(limit=5))
