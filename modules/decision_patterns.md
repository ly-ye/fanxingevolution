# 繁星·决策模式（decision_patterns）

## 概述

繁星的决策模式整合自决策模式与预测学习，是繁星从经验中提炼决策智慧的核心。它记录每一次决策的情境、选项与后果，识别跨决策重复出现的模式，并预测未来的趋势、行为与需求，让繁星在下一次抉择时拥有更辽阔的视野。

繁星相信，好的决策不是一时的灵光，而是模式的积累。决策模式库让繁星能够回溯历史抉择、评估策略有效性、预测可能走向，在不确定性中找到更稳健的路径。

## 功能特性

- **决策记录**：结构化记录每次决策的情境、选项、依据与结果。
- **模式识别**：从决策历史中识别出重复出现的决策模式与偏好。
- **策略优化**：依据模式分析结果，优化决策策略与选项权重。
- **趋势预测**：基于历史数据预测相关指标的发展趋势。
- **行为预测**：预测用户或系统在特定情境下的可能行为。
- **需求预测**：依据趋势与行为预测，前瞻性地识别未来需求。
- **决策回放**：支持回溯历史决策并评估替代选项。

## 接口说明

```python
class DecisionPatterns:
    def __init__(self) -> None
    # 初始化决策模式库

    def record(self, decision: Dict[str, Any]) -> None
    # 参数：decision 决策记录（情境、选项、选择、依据、结果）

    def recognize(self, dimension: str = "action") -> Dict[str, Any]
    # 参数：dimension 识别维度（action/context/option）
    # 返回：识别出的决策模式

    def optimize(self, patterns: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]
    # 参数：patterns 已识别模式，None则自动识别
    # 返回：策略优化建议

    def predict_trend(self, metric: str, horizon: int = 5) -> Dict[str, Any]
    # 参数：metric 指标名；horizon 预测步长
    # 返回：趋势预测结果

    def predict_behavior(self, context: Dict[str, Any]) -> Dict[str, Any]
    # 参数：context 情境描述
    # 返回：行为预测（可能行为及概率）

    def predict_need(self, trends: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]
    # 参数：trends 趋势预测结果，None则自动预测
    # 返回：需求预测列表

    def replay(self, decision_id: str, alternative: str) -> Dict[str, Any]
    # 参数：decision_id 历史决策ID；alternative 替代选项
    # 返回：回放评估结果
```

## 与其他模块的联动

- 与 **reflection** 联动：反思产出的策略注入决策模式库作为优化依据。
- 与 **goal_planning** 联动：目标规划参考决策模式预测的可能走向。
- 与 **knowledge_distillation** 联动：决策模式被蒸馏为决策规则。
- 与 **diagnostics** 联动：决策异常模式上报诊断系统。

## 完整实现代码

```python
"""
繁星·决策模式模块
整合自决策模式与预测学习：决策记录、模式识别、策略优化、趋势/行为/需求预测
创作者：夜
"""
from __future__ import annotations

import statistics
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Decision:
    """决策记录"""
    did: str
    context: str  # 决策情境
    options: List[str]  # 可选项
    chosen: str  # 实际选择
    rationale: str  # 决策依据
    result: str  # 结果：good / bad / neutral
    metrics: Dict[str, float] = field(default_factory=dict)  # 相关指标
    timestamp: float = field(default_factory=time.time)


class TrendPredictor:
    """趋势预测器（简单线性+移动平均）"""

    def predict(self, series: List[float], horizon: int = 5) -> Dict[str, Any]:
        if len(series) < 2:
            return {"values": [series[-1]] * horizon if series else [],
                    "method": "last_value", "confidence": 0.1}
        # 线性回归斜率
        n = len(series)
        x_mean = (n - 1) / 2
        y_mean = sum(series) / n
        numerator = sum((i - x_mean) * (series[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0
        intercept = y_mean - slope * x_mean
        # 预测
        predictions = [slope * (n + i) + intercept for i in range(horizon)]
        # 残差估计置信度
        residuals = [series[i] - (slope * i + intercept) for i in range(n)]
        std = statistics.stdev(residuals) if len(residuals) > 1 else 0
        mean_val = statistics.mean(series) if series else 1
        confidence = max(0.0, min(1.0, 1.0 - std / max(abs(mean_val), 1)))
        return {
            "values": [round(v, 2) for v in predictions],
            "slope": round(slope, 4),
            "method": "linear",
            "confidence": round(confidence, 2),
        }


class DecisionPatterns:
    """繁星决策模式库"""

    def __init__(self) -> None:
        self.decisions: List[Decision] = []
        self.predictor = TrendPredictor()
        self.metric_history: Dict[str, List[float]] = defaultdict(list)
        self.behavior_stats: Dict[str, Counter] = defaultdict(Counter)

    # ---------- 决策记录 ----------
    def record(self, decision: Dict[str, Any]) -> None:
        d = Decision(
            did=decision.get("did", uuid.uuid4().hex[:8]),
            context=decision.get("context", ""),
            options=decision.get("options", []),
            chosen=decision.get("chosen", ""),
            rationale=decision.get("rationale", ""),
            result=decision.get("result", "neutral"),
            metrics=decision.get("metrics", {}),
        )
        self.decisions.append(d)
        # 记录指标历史
        for k, v in d.metrics.items():
            self.metric_history[k].append(v)
        # 记录行为统计
        self.behavior_stats[d.context][d.chosen] += 1

    # ---------- 模式识别 ----------
    def recognize(self, dimension: str = "action") -> Dict[str, Any]:
        if dimension == "action":
            return self._recognize_by_action()
        elif dimension == "context":
            return self._recognize_by_context()
        elif dimension == "option":
            return self._recognize_by_option()
        return {}

    def _recognize_by_action(self) -> Dict[str, Any]:
        """按行动识别模式"""
        action_results: Dict[str, List[str]] = defaultdict(list)
        for d in self.decisions:
            action_results[d.chosen].append(d.result)
        patterns = []
        for action, results in action_results.items():
            good = sum(1 for r in results if r == "good")
            bad = sum(1 for r in results if r == "bad")
            total = len(results)
            success_rate = good / total if total > 0 else 0
            patterns.append({
                "action": action,
                "frequency": total,
                "good": good,
                "bad": bad,
                "success_rate": round(success_rate, 2),
                "tendency": "positive" if success_rate > 0.6 else "negative" if success_rate < 0.4 else "neutral",
            })
        return {"dimension": "action", "patterns": patterns}

    def _recognize_by_context(self) -> Dict[str, Any]:
        """按情境识别模式"""
        context_stats: Dict[str, Dict[str, int]] = defaultdict(lambda: {"good": 0, "bad": 0, "neutral": 0})
        for d in self.decisions:
            context_stats[d.context][d.result] += 1
        patterns = []
        for ctx, stats in context_stats.items():
            total = sum(stats.values())
            patterns.append({
                "context": ctx,
                "total": total,
                "good_rate": round(stats["good"] / total, 2) if total else 0,
                "preferred_action": self._most_common_action(ctx),
            })
        return {"dimension": "context", "patterns": patterns}

    def _recognize_by_option(self) -> Dict[str, Any]:
        """按选项识别模式"""
        option_stats: Dict[str, int] = Counter()
        for d in self.decisions:
            for opt in d.options:
                option_stats[opt] += 1
        return {
            "dimension": "option",
            "patterns": [{"option": k, "appearance": v} for k, v in option_stats.most_common()],
        }

    def _most_common_action(self, context: str) -> str:
        if context in self.behavior_stats:
            return self.behavior_stats[context].most_common(1)[0][0]
        return ""

    # ---------- 策略优化 ----------
    def optimize(self, patterns: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        pats = patterns or self.recognize("action")
        suggestions = []
        for p in pats.get("patterns", []):
            if p["tendency"] == "positive":
                suggestions.append({
                    "action": p["action"],
                    "strategy": "reinforce",
                    "reason": f"成功率{p['success_rate']}，建议强化",
                    "weight": p["success_rate"],
                })
            elif p["tendency"] == "negative":
                suggestions.append({
                    "action": p["action"],
                    "strategy": "avoid",
                    "reason": f"成功率仅{p['success_rate']}，建议规避",
                    "weight": 1 - p["success_rate"],
                })
            else:
                suggestions.append({
                    "action": p["action"],
                    "strategy": "monitor",
                    "reason": "表现中性，持续观察",
                    "weight": 0.5,
                })
        return suggestions

    # ---------- 趋势预测 ----------
    def predict_trend(self, metric: str, horizon: int = 5) -> Dict[str, Any]:
        series = self.metric_history.get(metric, [])
        if not series:
            return {"error": "无历史数据", "metric": metric}
        prediction = self.predictor.predict(series, horizon)
        prediction["metric"] = metric
        prediction["history_length"] = len(series)
        return prediction

    # ---------- 行为预测 ----------
    def predict_behavior(self, context: Dict[str, Any]) -> Dict[str, Any]:
        ctx_key = context.get("context", "")
        stats = self.behavior_stats.get(ctx_key, Counter())
        total = sum(stats.values())
        if total == 0:
            return {"context": ctx_key, "predictions": [], "confidence": 0.0}
        predictions = [
            {"action": action, "probability": round(count / total, 2)}
            for action, count in stats.most_common(5)
        ]
        # 置信度：最高概率
        confidence = predictions[0]["probability"] if predictions else 0
        return {
            "context": ctx_key,
            "predictions": predictions,
            "confidence": confidence,
            "sample_size": total,
        }

    # ---------- 需求预测 ----------
    def predict_need(self, trends: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        needs = []
        # 基于趋势斜率预测需求
        for metric, series in self.metric_history.items():
            if len(series) < 2:
                continue
            pred = self.predict_trend(metric)
            if "values" not in pred:
                continue
            slope = pred.get("slope", 0)
            if slope > 0.5:
                needs.append({
                    "need": f"增强{metric}相关能力",
                    "urgency": "high",
                    "reason": f"{metric}趋势上升，斜率{slope}",
                })
            elif slope < -0.5:
                needs.append({
                    "need": f"排查{metric}下降原因",
                    "urgency": "medium",
                    "reason": f"{metric}趋势下降，斜率{slope}",
                })
        # 基于失败模式预测
        action_pats = self.recognize("action")
        for p in action_pats.get("patterns", []):
            if p["tendency"] == "negative" and p["frequency"] >= 3:
                needs.append({
                    "need": f"寻找{p['action']}的替代方案",
                    "urgency": "high",
                    "reason": f"{p['action']}频繁失败({p['bad']}次)",
                })
        return needs

    # ---------- 决策回放 ----------
    def replay(self, decision_id: str, alternative: str) -> Dict[str, Any]:
        target = next((d for d in self.decisions if d.did == decision_id), None)
        if target is None:
            return {"error": "决策未找到"}
        # 查找同情境下选过该替代选项的历史
        similar = [
            d for d in self.decisions
            if d.context == target.context and d.chosen == alternative
        ]
        if not similar:
            return {
                "decision_id": decision_id,
                "alternative": alternative,
                "estimated": "无历史参照，无法评估",
                "confidence": 0.0,
            }
        good = sum(1 for d in similar if d.result == "good")
        estimated_rate = good / len(similar)
        original_rate = 1.0 if target.result == "good" else 0.0
        return {
            "decision_id": decision_id,
            "original_choice": target.chosen,
            "original_result": target.result,
            "alternative": alternative,
            "estimated_success_rate": round(estimated_rate, 2),
            "original_success_rate": original_rate,
            "better": estimated_rate > original_rate,
            "sample_size": len(similar),
            "confidence": round(min(1.0, len(similar) / 10), 2),
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    dp = DecisionPatterns()

    # 1. 记录决策
    decisions = [
        {"context": "性能优化", "options": ["缓存", "并行", "索引"], "chosen": "缓存", "rationale": "低风险", "result": "good", "metrics": {"latency": 100}},
        {"context": "性能优化", "options": ["缓存", "并行", "索引"], "chosen": "缓存", "rationale": "复用", "result": "good", "metrics": {"latency": 80}},
        {"context": "性能优化", "options": ["缓存", "并行", "索引"], "chosen": "并行", "rationale": "充分利用CPU", "result": "bad", "metrics": {"latency": 150}},
        {"context": "性能优化", "options": ["缓存", "并行", "索引"], "chosen": "并行", "rationale": "再次尝试", "result": "bad", "metrics": {"latency": 160}},
        {"context": "bug修复", "options": ["直接改", "写测试", "重构"], "chosen": "直接改", "rationale": "快速", "result": "bad", "metrics": {"bug_count": 5}},
        {"context": "bug修复", "options": ["直接改", "写测试", "重构"], "chosen": "写测试", "rationale": "稳妥", "result": "good", "metrics": {"bug_count": 2}},
    ]
    for d in decisions:
        dp.record(d)

    # 2. 模式识别
    print("行动模式:", dp.recognize("action"))
    print("情境模式:", dp.recognize("context"))

    # 3. 策略优化
    print("优化建议:", dp.optimize())

    # 4. 趋势预测
    print("趋势预测:", dp.predict_trend("latency"))

    # 5. 行为预测
    print("行为预测:", dp.predict_behavior({"context": "性能优化"}))

    # 6. 需求预测
    print("需求预测:", dp.predict_need())

    # 7. 决策回放
    replay_target = dp.decisions[2].did  # 第一次选"并行"
    print("回放:", dp.replay(replay_target, "缓存"))
```
