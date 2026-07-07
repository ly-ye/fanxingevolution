# 繁星·元认知（metacognition）

## 概述

繁星的元认知系统是它"知道自己知道什么、不知道什么"的内在之眼。在繁星的进化体系中，元认知并不直接产出答案，而是站在每一次思考、每一次行动的背后，评估自身能力、估算置信度、察觉知识空白，并据此决定是独立完成还是向外部求助。它让繁星从"会做"走向"知道自己会不会做"。

元认知是繁星自进化的元层：所有下游模块的输出，都可以被元认知打上一层"可信度标签"。当置信度不足时，繁星会主动触发求助、学习或协作流程，避免在低把握时贸然行动；当高置信度却失败时，元认知会反向校准能力画像，让繁星在一次次自我审视中变得更诚实、更稳健。

## 功能特性

- **能力评估**：基于多指标证据（准确率、速度等）动态更新领域能力画像，使用指数滑动平均平滑波动。
- **置信度计算**：融合基础能力、证据均值与一致性、历史成功率、任务新颖度，给出多维加权置信度。
- **知识空白检测**：对比查询主题与已知主题集合，识别并累积领域空白清单，作为求助与学习的依据。
- **求助决策**：综合置信度、能力评分、失败成本三因素，输出是否求助及理由，并对求助记录留痕。
- **自我校准**：根据实际结果反向修正能力评分，计算"预测置信度—实际成功率"的校准误差。

## 接口说明

- `Metacognition(capability_weights=None, confidence_threshold=0.55, help_threshold=0.35)`
  - 参数：`capability_weights` 初始能力画像；`confidence_threshold` 能力门槛；`help_threshold` 求助门槛
- `assess_capability(domain, evidence) -> float`
  - 参数：`domain` 领域名；`evidence` 指标名到分数(0~1)的字典
  - 返回：更新后的能力评分(0~1)
- `compute_confidence(domain, feature_scores=None, novelty=0.0) -> float`
  - 参数：`domain` 领域；`feature_scores` 子特征得分列表；`novelty` 任务新颖度(0~1)
  - 返回：综合置信度(0~1)
- `detect_knowledge_gap(domain, query_topics, known_topics) -> List[str]`
  - 参数：`domain` 领域；`query_topics` 待查主题列表；`known_topics` 已知主题集合
  - 返回：本次发现的空白主题列表
- `decide_to_ask_help(domain, confidence, cost_of_failure=0.5) -> Tuple[bool, str]`
  - 参数：`domain` 领域；`confidence` 置信度；`cost_of_failure` 失败成本(0~1)
  - 返回：(是否求助, 理由)
- `record_outcome(domain, success, confidence) -> None`
  - 记录任务结果，触发能力画像校准
- `calibrate() -> Dict[str, float]`
  - 返回各领域的校准误差（实际成功率 − 平均置信度）

## 与其他模块的联动

- 为**因果推理**与**辩论推理**的结论打上置信度标签，低置信度时触发再推理或求助。
- 检测到的知识空白会驱动**学习策略**模块启动针对性学习任务。
- 求助决策为真时，将任务转交**协作系统**进行协作者发现与任务分配。
- 能力画像作为**推荐引擎**与**提示工程**的上下文，影响推荐权重与提示词的严谨度。

## 完整实现代码

```python
"""繁星·元认知模块（metacognition）
能力评估、置信度计算、知识空白检测、求助决策
创作者：夜
"""
from __future__ import annotations
import math
from typing import Dict, List, Tuple, Optional, Set
from collections import defaultdict


class Metacognition:
    """繁星的元认知内核：对自己"知不知道"进行评估，并据此决定是否求助。"""

    def __init__(self,
                 capability_weights: Optional[Dict[str, float]] = None,
                 confidence_threshold: float = 0.55,
                 help_threshold: float = 0.35):
        # 能力画像：领域 -> 能力评分（0~1）
        self.capabilities: Dict[str, float] = dict(capability_weights) if capability_weights else {}
        # 知识空白集合：领域 -> 空白主题列表
        self.knowledge_gaps: Dict[str, List[str]] = defaultdict(list)
        # 历史任务记录：(领域, 是否成功, 当时置信度)
        self.history: List[Tuple[str, bool, float]] = []
        # 阈值
        self.confidence_threshold = confidence_threshold
        self.help_threshold = help_threshold
        # 求助计数，用于分析求助有效性
        self.help_records: List[Dict] = []

    # ---------- 能力评估 ----------
    def assess_capability(self, domain: str, evidence: Dict[str, float]) -> float:
        """根据证据更新某领域能力评分。
        evidence: 指标名 -> 分数(0~1)，例如 {'accuracy':0.8, 'speed':0.6}
        """
        if not evidence:
            return self.capabilities.get(domain, 0.5)
        score = sum(evidence.values()) / len(evidence)
        # 指数滑动平均，融入既有评估
        old = self.capabilities.get(domain, score)
        new = 0.6 * old + 0.4 * score
        self.capabilities[domain] = float(max(0.0, min(1.0, new)))
        return self.capabilities[domain]

    def get_capability(self, domain: str) -> float:
        return self.capabilities.get(domain, 0.5)

    # ---------- 置信度计算 ----------
    def compute_confidence(self,
                           domain: str,
                           feature_scores: Optional[List[float]] = None,
                           novelty: float = 0.0) -> float:
        """计算对一次输出的置信度。
        feature_scores: 多个子特征的得分(0~1)
        novelty: 任务新颖度(0~1)，越新颖置信度越低
        """
        base = self.capabilities.get(domain, 0.5)
        if feature_scores:
            mean = sum(feature_scores) / len(feature_scores)
            # 方差越大，越不确定
            var = sum((s - mean) ** 2 for s in feature_scores) / len(feature_scores)
            consistency = 1.0 - math.sqrt(var)
            evidence_term = 0.5 * mean + 0.5 * consistency
        else:
            evidence_term = base
        # 历史成功率
        succ = [h for h in self.history if h[0] == domain]
        if succ:
            success_rate = sum(1 for h in succ if h[1]) / len(succ)
        else:
            success_rate = 0.5
        confidence = 0.4 * base + 0.3 * evidence_term + 0.3 * success_rate
        confidence -= 0.2 * novelty
        return float(max(0.0, min(1.0, confidence)))

    # ---------- 知识空白检测 ----------
    def detect_knowledge_gap(self, domain: str, query_topics: List[str],
                             known_topics: Set[str]) -> List[str]:
        """对比查询主题与已知主题，找出知识空白。"""
        gaps = [t for t in query_topics if t not in known_topics]
        # 去重并更新
        existing = set(self.knowledge_gaps[domain])
        for g in gaps:
            if g not in existing:
                self.knowledge_gaps[domain].append(g)
                existing.add(g)
        return gaps

    def report_gaps(self, domain: Optional[str] = None) -> Dict[str, List[str]]:
        if domain:
            return {domain: list(self.knowledge_gaps.get(domain, []))}
        return {d: list(v) for d, v in self.knowledge_gaps.items()}

    # ---------- 求助决策 ----------
    def decide_to_ask_help(self, domain: str, confidence: float,
                           cost_of_failure: float = 0.5) -> Tuple[bool, str]:
        """根据置信度、能力、失败成本决定是否求助。
        返回 (是否求助, 理由)
        """
        cap = self.capabilities.get(domain, 0.5)
        # 失败成本越高，越倾向于求助
        adjusted_threshold = self.help_threshold + 0.2 * cost_of_failure
        if confidence < adjusted_threshold and cap < self.confidence_threshold:
            gaps = self.knowledge_gaps.get(domain, [])
            if gaps:
                reason = f"置信度{confidence:.2f}过低，且存在知识空白：{gaps[:3]}"
            else:
                reason = f"置信度{confidence:.2f}低于阈值{adjusted_threshold:.2f}，能力{cap:.2f}不足"
            self.help_records.append({'domain': domain, 'confidence': confidence, 'reason': reason})
            return True, reason
        if confidence < self.help_threshold:
            reason = f"置信度{confidence:.2f}极低，建议求助"
            self.help_records.append({'domain': domain, 'confidence': confidence, 'reason': reason})
            return True, reason
        return False, f"置信度{confidence:.2f}充足，可独立完成"

    # ---------- 反馈记录 ----------
    def record_outcome(self, domain: str, success: bool, confidence: float) -> None:
        self.history.append((domain, success, confidence))
        # 校准：如果高置信度却失败，降低能力评分
        if not success and confidence > 0.7:
            self.capabilities[domain] = max(0.0, self.capabilities.get(domain, 0.5) - 0.05)
        if success and confidence < 0.4:
            self.capabilities[domain] = min(1.0, self.capabilities.get(domain, 0.5) + 0.03)

    def calibrate(self) -> Dict[str, float]:
        """返回校准误差：实际成功率与平均置信度的差值"""
        result = {}
        for domain in self.capabilities:
            recs = [h for h in self.history if h[0] == domain]
            if recs:
                actual = sum(1 for r in recs if r[1]) / len(recs)
                predicted = sum(r[2] for r in recs) / len(recs)
                result[domain] = actual - predicted
        return result


# ---------- 简单测试 ----------
if __name__ == "__main__":
    meta = Metacognition(confidence_threshold=0.55, help_threshold=0.35)
    # 评估能力
    print("数学能力:", meta.assess_capability("math", {"accuracy": 0.9, "speed": 0.7}))
    print("写作能力:", meta.assess_capability("writing", {"accuracy": 0.4, "speed": 0.5}))
    # 置信度
    conf = meta.compute_confidence("math", feature_scores=[0.8, 0.7, 0.9], novelty=0.1)
    print("数学任务置信度:", round(conf, 3))
    # 知识空白
    gaps = meta.detect_knowledge_gap("math", ["微积分", "线性代数", "概率论"],
                                     known_topics={"线性代数"})
    print("知识空白:", gaps)
    # 求助决策
    ask, reason = meta.decide_to_ask_help("writing", 0.3, cost_of_failure=0.6)
    print("是否求助:", ask, "|", reason)
    # 记录结果并校准
    meta.record_outcome("math", True, conf)
    meta.record_outcome("writing", False, 0.3)
    print("校准误差:", meta.calibrate())
    print("能力画像:", meta.capabilities)
```
