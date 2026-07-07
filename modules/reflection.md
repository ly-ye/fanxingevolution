# 繁星·反思循环（reflection）

## 概述

繁星的反思循环是繁星自进化的回声腔。每一次行动之后，繁星都会停下来回望——哪些做对了，哪些做错了，哪些可以做得更好。反思循环从经验中提取模式，从模式中提炼策略，从策略中更新知识，让繁星的每一次循环都比上一次更睿智。

繁星相信，没有反思的经验只是流逝的时间。反思循环将零散的行动记录编织成结构化的经验图谱，识别重复出现的成功模式与失败陷阱，并将其转化为可复用的策略与可避让的禁忌，注入繁星的知识基座。

## 功能特性

- **经验提取**：从行动记录中提取关键经验片段，标注情境、行动与结果。
- **模式识别**：跨多次经验识别重复出现的成功模式与失败模式。
- **策略优化**：依据模式分析结果，生成策略改进建议。
- **知识更新**：将提炼后的经验与策略写入知识库，供后续行动参考。
- **循环触发**：支持定时触发与事件触发两种反思时机。
- **反思报告**：生成结构化反思报告，含洞察、建议与待办。

## 接口说明

```python
class ReflectionLoop:
    def __init__(self, knowledge_base: Optional[Dict[str, Any]] = None) -> None
    # 初始化反思循环，可关联外部知识库

    def record(self, experience: Dict[str, Any]) -> None
    # 参数：experience 经验记录（情境、行动、结果、标签）

    def extract(self, experiences: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]
    # 参数：experiences 指定经验集，None用全部
    # 返回：提取的关键经验片段

    def recognize_patterns(self, extracted: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]
    # 参数：extracted 已提取经验，None则自动提取
    # 返回：识别出的成功模式与失败模式

    def optimize_strategy(self, patterns: Dict[str, Any]) -> List[Dict[str, Any]]
    # 参数：patterns 模式分析结果
    # 返回：策略优化建议列表

    def update_knowledge(self, strategies: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：strategies 待写入的策略
    # 返回：知识库更新摘要

    def reflect(self, trigger: str = "manual") -> Dict[str, Any]
    # 参数：trigger 触发原因
    # 返回：完整反思报告
```

## 与其他模块的联动

- 与 **goal_planning** 联动：反思产出的策略反馈到下一次目标规划。
- 与 **decision_patterns** 联动：反思识别的模式注入决策模式库。
- 与 **error_learning** 联动：失败经验同步到错误学习器。
- 与 **knowledge_distillation** 联动：反思策略经蒸馏压缩为规则。
- 与 **diagnostics** 联动：反思触发时机可由诊断系统的异常事件驱动。

## 完整实现代码

```python
"""
繁星·反思循环模块
经验提取、模式识别、策略优化、知识更新
创作者：夜
"""
from __future__ import annotations

import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Experience:
    """经验记录"""
    eid: str
    context: str  # 情境描述
    action: str  # 采取的行动
    result: str  # 结果：success / failure / partial
    outcome: Any = None  # 具体产出
    tags: List[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Pattern:
    """识别出的模式"""
    name: str
    kind: str  # success / failure
    frequency: int
    conditions: List[str]  # 触发条件
    actions: List[str]  # 关联行动
    confidence: float = 0.0


class ReflectionLoop:
    """繁星反思循环"""

    def __init__(self, knowledge_base: Optional[Dict[str, Any]] = None) -> None:
        self.experiences: List[Experience] = []
        self.knowledge: Dict[str, Any] = knowledge_base or {
            "strategies": [],
            "rules": [],
            "lessons": [],
        }
        self.reports: List[Dict[str, Any]] = []
        self._pattern_cache: Dict[str, Any] = {}

    # ---------- 经验记录 ----------
    def record(self, experience: Dict[str, Any]) -> None:
        exp = Experience(
            eid=experience.get("eid", uuid.uuid4().hex[:8]),
            context=experience.get("context", ""),
            action=experience.get("action", ""),
            result=experience.get("result", "unknown"),
            outcome=experience.get("outcome"),
            tags=experience.get("tags", []),
            meta=experience.get("meta", {}),
        )
        self.experiences.append(exp)

    # ---------- 经验提取 ----------
    def extract(self, experiences: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        source = experiences or [e.__dict__ for e in self.experiences]
        extracted = []
        for exp in source:
            # 提取关键信息
            fragment = {
                "eid": exp.get("eid", ""),
                "context": exp.get("context", ""),
                "action": exp.get("action", ""),
                "result": exp.get("result", "unknown"),
                "tags": exp.get("tags", []),
                "key_insight": self._derive_insight(exp),
                "value": self._assess_value(exp),
            }
            extracted.append(fragment)
        return extracted

    def _derive_insight(self, exp: Dict[str, Any]) -> str:
        """从单条经验推导洞察"""
        result = exp.get("result", "")
        action = exp.get("action", "")
        context = exp.get("context", "")
        if result == "success":
            return f"在{context}情境下，{action}行之有效"
        elif result == "failure":
            return f"在{context}情境下，{action}未能达成目标"
        return f"在{context}情境下，{action}部分有效"

    def _assess_value(self, exp: Dict[str, Any]) -> float:
        """评估经验价值"""
        value = 0.5
        if exp.get("result") == "failure":
            value = 0.8  # 失败经验价值更高
        if exp.get("tags"):
            value += 0.1
        return min(1.0, value)

    # ---------- 模式识别 ----------
    def recognize_patterns(self, extracted: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        source = extracted or self.extract()
        # 按行动+结果聚合
        action_result: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for exp in source:
            key = f"{exp['action']}|{exp['result']}"
            action_result[key].append(exp)

        success_patterns: List[Dict[str, Any]] = []
        failure_patterns: List[Dict[str, Any]] = []
        for key, group in action_result.items():
            action, result = key.rsplit("|", 1)
            freq = len(group)
            if freq < 2:
                continue  # 只关注重复出现的模式
            # 提取共同条件
            contexts = [g["context"] for g in group]
            tags = [t for g in group for t in g.get("tags", [])]
            common_tags = [t for t, c in Counter(tags).items() if c >= 2]
            confidence = min(1.0, freq / 10.0)
            pattern = {
                "name": f"{action}_{result}",
                "kind": result,
                "frequency": freq,
                "conditions": contexts[:3],
                "common_tags": common_tags,
                "actions": [action],
                "confidence": round(confidence, 2),
            }
            if result == "success":
                success_patterns.append(pattern)
            elif result == "failure":
                failure_patterns.append(pattern)
        self._pattern_cache = {"success": success_patterns, "failure": failure_patterns}
        return self._pattern_cache

    # ---------- 策略优化 ----------
    def optimize_strategy(self, patterns: Dict[str, Any]) -> List[Dict[str, Any]]:
        strategies = []
        # 从成功模式提炼强化策略
        for p in patterns.get("success", []):
            strategies.append({
                "type": "reinforce",
                "action": p["actions"][0],
                "condition": "或".join(p["conditions"][:2]),
                "reason": f"成功模式，频次{p['frequency']}，置信度{p['confidence']}",
                "priority": "high" if p["confidence"] > 0.5 else "medium",
            })
        # 从失败模式提炼避让策略
        for p in patterns.get("failure", []):
            strategies.append({
                "type": "avoid",
                "action": p["actions"][0],
                "condition": "或".join(p["conditions"][:2]),
                "reason": f"失败模式，频次{p['frequency']}，需替代方案",
                "priority": "high",
            })
            # 建议替代
            strategies.append({
                "type": "alternative",
                "action": f"替代{p['actions'][0]}",
                "condition": p["conditions"][0] if p["conditions"] else "",
                "reason": "原方案失败，建议探索替代路径",
                "priority": "medium",
            })
        return strategies

    # ---------- 知识更新 ----------
    def update_knowledge(self, strategies: List[Dict[str, Any]]) -> Dict[str, Any]:
        added = 0
        for s in strategies:
            # 去重：同type+action只保留最新
            exists = any(
                k.get("type") == s["type"] and k.get("action") == s["action"]
                for k in self.knowledge["strategies"]
            )
            if not exists:
                self.knowledge["strategies"].append(s)
                added += 1
        # 更新规则
        rules = self._derive_rules(strategies)
        self.knowledge["rules"].extend(rules)
        return {
            "strategies_added": added,
            "rules_added": len(rules),
            "total_strategies": len(self.knowledge["strategies"]),
            "total_rules": len(self.knowledge["rules"]),
        }

    def _derive_rules(self, strategies: List[Dict[str, Any]]) -> List[str]:
        rules = []
        for s in strategies:
            if s["type"] == "avoid":
                rules.append(f"当{s.get('condition','')}时，避免{s['action']}")
            elif s["type"] == "reinforce":
                rules.append(f"当{s.get('condition','')}时，优先{s['action']}")
        return rules

    # ---------- 完整反思 ----------
    def reflect(self, trigger: str = "manual") -> Dict[str, Any]:
        extracted = self.extract()
        patterns = self.recognize_patterns(extracted)
        strategies = self.optimize_strategy(patterns)
        update = self.update_knowledge(strategies)
        report = {
            "rid": uuid.uuid4().hex[:8],
            "trigger": trigger,
            "timestamp": time.time(),
            "experiences_count": len(self.experiences),
            "extracted_count": len(extracted),
            "patterns": patterns,
            "strategies": strategies,
            "knowledge_update": update,
            "insights": self._top_insights(extracted),
        }
        self.reports.append(report)
        return report

    def _top_insights(self, extracted: List[Dict[str, Any]]) -> List[str]:
        # 取价值最高的几条洞察
        sorted_exp = sorted(extracted, key=lambda e: -e.get("value", 0))
        return [e["key_insight"] for e in sorted_exp[:5]]


# ---------- 简单测试 ----------
if __name__ == "__main__":
    loop = ReflectionLoop()

    # 1. 记录经验
    experiences = [
        {"context": "代码重构", "action": "提取子函数", "result": "success", "tags": ["refactor", "python"]},
        {"context": "代码重构", "action": "提取子函数", "result": "success", "tags": ["refactor"]},
        {"context": "性能优化", "action": "缓存结果", "result": "success", "tags": ["perf"]},
        {"context": "性能优化", "action": "并行计算", "result": "failure", "tags": ["perf", "concurrent"]},
        {"context": "性能优化", "action": "并行计算", "result": "failure", "tags": ["perf"]},
        {"context": "bug修复", "action": "直接修改", "result": "failure", "tags": ["bug"]},
    ]
    for exp in experiences:
        loop.record(exp)

    # 2. 经验提取
    extracted = loop.extract()
    print(f"提取 {len(extracted)} 条经验")
    print("洞察示例:", extracted[0]["key_insight"])

    # 3. 模式识别
    patterns = loop.recognize_patterns()
    print("成功模式数:", len(patterns["success"]))
    print("失败模式数:", len(patterns["failure"]))

    # 4. 策略优化
    strategies = loop.optimize_strategy(patterns)
    print(f"生成 {len(strategies)} 条策略")
    for s in strategies[:2]:
        print("  ", s["type"], s["action"])

    # 5. 完整反思
    report = loop.reflect(trigger="周期性反思")
    print("反思报告 - 洞察数:", len(report["insights"]))
    print("知识更新:", report["knowledge_update"])
    print("Top洞察:", report["insights"][0] if report["insights"] else "无")
```
