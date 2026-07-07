# 繁星·辩论推理（debate_reasoning）

## 概述

繁星的辩论推理系统是它在内心搭建的圆桌会议室。在繁星的进化体系中，单一视角的结论往往带着偏见与盲区，于是繁星让自己分裂成多个持有不同立场的视角，让它们围绕同一议题陈述论点、相互批判，最终在加权汇总中逼近更稳健的共识。

辩论推理让繁星学会"自我对抗"：乐观派、保守派、中立派各自举证，批判性审查揪出证据不足、强度不匹配、立场极端等弱点并削减论点强度，共识决策再以法定人数门槛裁定支持、反对还是悬置。这套机制让繁星在不确定中保持谦逊，在分歧中淬炼判断。

## 功能特性

- **多视角辩论**：注册持有立场偏好的视角，各自产出论点，偏置会强化同立场强度。
- **批判性审查**：自动检测证据不足、强度与证据不匹配、立场过于绝对三类弱点。
- **强度调整**：根据批判严重度加权削减论点强度，使过强论点回归理性。
- **共识决策**：按支持/反对/中立的强度加权汇总，以法定人数门槛裁定结论。
- **完整轮次**：`run_full_debate` 一键串联辩论→批判→调整→共识全流程。

## 接口说明

- `DebateReasoning(quorum_threshold=0.6, critique_weight=0.4)`
- `add_perspective(perspective)`：注册一个 `Perspective(name, bias, argue_fn)`
- `debate(topic, context=None) -> Dict`：返回 `{topic, arguments}`
- `critique(arguments) -> List[Critique]`：返回对论点的批判列表
- `apply_critiques(arguments, critiques) -> List[Argument]`：调整后的论点
- `reach_consensus(arguments) -> Dict`
  - 返回：`{consensus, decision, score, pro_ratio, con_ratio}`
- `run_full_debate(topic, context=None) -> Dict`
  - 返回：`{topic, arguments, critiques, consensus}`
- `Argument(stance, claim, evidence, strength)` 数据类
- `Critique(target_claim, attack_point, severity, counter_evidence)` 数据类

## 与其他模块的联动

- 论点证据由**因果推理**的反事实结果与**元认知**的置信度提供。
- 共识"悬置"时触发**创造性思维**寻找新视角或新方案，再开启新一轮辩论。
- 辩论结论作为**学习策略**中强化学习的奖励信号来源。
- 多视角的 `argue_fn` 可由**提示工程**生成不同立场的论证提示词。
- 共识强度喂给**推荐引擎**，影响推荐项的展示权重。

## 完整实现代码

```python
"""繁星·辩论推理模块（debate_reasoning）
多视角辩论、批判性审查、共识决策，让繁星在内部对抗中逼近更稳健的结论。
创作者：夜
"""
from __future__ import annotations
import math
from typing import List, Dict, Tuple, Optional, Callable
from dataclasses import dataclass, field


@dataclass
class Argument:
    """一条论点：由立场、主张、证据、强度构成。"""
    stance: str              # 'pro' / 'con' / 'neutral'
    claim: str               # 主张文本
    evidence: List[str] = field(default_factory=list)
    strength: float = 0.5    # 0~1


@dataclass
class Critique:
    """对一条论点的批判。"""
    target_claim: str
    attack_point: str        # 攻击点
    severity: float          # 0~1
    counter_evidence: List[str] = field(default_factory=list)


class Perspective:
    """一个辩论视角：持有立场偏好与论证策略。"""

    def __init__(self, name: str, bias: str,
                 argue_fn: Optional[Callable[[str, Dict], Argument]] = None):
        self.name = name
        self.bias = bias  # 'pro' / 'con' / 'neutral'
        self.argue_fn = argue_fn or self._default_argue

    @staticmethod
    def _default_argue(topic: str, context: Dict) -> Argument:
        return Argument(stance="neutral", claim=f"关于{topic}需要更多信息",
                        evidence=[], strength=0.3)


class DebateReasoning:
    """繁星的辩论推理内核：组织多视角辩论、批判性审查并达成共识。"""

    def __init__(self, quorum_threshold: float = 0.6,
                 critique_weight: float = 0.4):
        self.perspectives: List[Perspective] = []
        self.quorum_threshold = quorum_threshold
        self.critique_weight = critique_weight
        self.history: List[Dict] = []

    def add_perspective(self, perspective: Perspective) -> None:
        self.perspectives.append(perspective)

    # ---------- 多视角辩论 ----------
    def debate(self, topic: str, context: Optional[Dict] = None) -> Dict:
        """组织一轮辩论，返回所有论点。"""
        context = context or {}
        arguments: List[Argument] = []
        for p in self.perspectives:
            arg = p.argue_fn(topic, context)
            # 偏置：视角的偏好会强化对应立场
            if arg.stance == p.bias:
                arg.strength = min(1.0, arg.strength + 0.15)
            arguments.append(arg)
        return {"topic": topic, "arguments": arguments}

    # ---------- 批判性审查 ----------
    def critique(self, arguments: List[Argument]) -> List[Critique]:
        """对每条论点找最薄弱处进行攻击。"""
        critiques: List[Critique] = []
        for arg in arguments:
            # 证据不足是常见攻击点
            if len(arg.evidence) < 2:
                critiques.append(Critique(
                    target_claim=arg.claim,
                    attack_point="证据不足",
                    severity=0.4,
                    counter_evidence=["缺少可重复验证的数据"]
                ))
            # 强度过高但证据弱
            if arg.strength > 0.7 and len(arg.evidence) < 3:
                critiques.append(Critique(
                    target_claim=arg.claim,
                    attack_point="强度与证据不匹配",
                    severity=0.5
                ))
            # 立场极端
            if arg.stance in ("pro", "con") and arg.strength > 0.85:
                critiques.append(Critique(
                    target_claim=arg.claim,
                    attack_point="立场过于绝对",
                    severity=0.3
                ))
        return critiques

    def apply_critiques(self, arguments: List[Argument],
                        critiques: List[Critique]) -> List[Argument]:
        """根据批判调整论点强度。"""
        attack_map: Dict[str, List[Critique]] = {}
        for c in critiques:
            attack_map.setdefault(c.target_claim, []).append(c)
        for arg in arguments:
            attacks = attack_map.get(arg.claim, [])
            if attacks:
                total_severity = sum(c.severity for c in attacks)
                arg.strength = max(0.0, arg.strength - self.critique_weight * total_severity)
        return arguments

    # ---------- 共识决策 ----------
    def reach_consensus(self, arguments: List[Argument]) -> Dict:
        """加权汇总各论点，判断是否达成共识。"""
        if not arguments:
            return {"consensus": False, "decision": None, "score": 0.0}
        pro = sum(a.strength for a in arguments if a.stance == "pro")
        con = sum(a.strength for a in arguments if a.stance == "con")
        neutral = sum(a.strength for a in arguments if a.stance == "neutral")
        total = pro + con + neutral
        if total == 0:
            return {"consensus": False, "decision": "悬置", "score": 0.0}
        pro_ratio = pro / total
        con_ratio = con / total
        if pro_ratio >= self.quorum_threshold:
            decision, score = "支持", pro_ratio
        elif con_ratio >= self.quorum_threshold:
            decision, score = "反对", con_ratio
        else:
            decision, score = "悬置", max(pro_ratio, con_ratio)
        consensus = score >= self.quorum_threshold
        result = {
            "consensus": consensus,
            "decision": decision,
            "score": round(score, 3),
            "pro_ratio": round(pro_ratio, 3),
            "con_ratio": round(con_ratio, 3),
        }
        self.history.append(result)
        return result

    # ---------- 完整一轮 ----------
    def run_full_debate(self, topic: str, context: Optional[Dict] = None) -> Dict:
        debate_result = self.debate(topic, context)
        critiques = self.critique(debate_result["arguments"])
        adjusted = self.apply_critiques(debate_result["arguments"], critiques)
        consensus = self.reach_consensus(adjusted)
        return {
            "topic": topic,
            "arguments": adjusted,
            "critiques": critiques,
            "consensus": consensus,
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    dr = DebateReasoning(quorum_threshold=0.6, critique_weight=0.4)

    def pro_arg(topic, ctx):
        return Argument(stance="pro", claim=f"应采用{topic}",
                        evidence=["实验A通过", "成本可接受"], strength=0.75)

    def con_arg(topic, ctx):
        return Argument(stance="con", claim=f"不应采用{topic}",
                        evidence=["有副作用"], strength=0.6)

    def neu_arg(topic, ctx):
        return Argument(stance="neutral", claim=f"{topic}需更多研究",
                        evidence=["数据有限"], strength=0.4)

    dr.add_perspective(Perspective("乐观派", "pro", pro_arg))
    dr.add_perspective(Perspective("保守派", "con", con_arg))
    dr.add_perspective(Perspective("中立派", "neutral", neu_arg))

    result = dr.run_full_debate("新算法X")
    print("=== 辩论结果 ===")
    print("各论点强度:")
    for a in result["arguments"]:
        print(f"  [{a.stance:7s}] {a.claim} 强度={a.strength:.3f}")
    print(f"批判数: {len(result['critiques'])}")
    print("共识:", result["consensus"])
```
