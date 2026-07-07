# 繁星·因果推理（causal_reasoning）

## 概述

繁星的因果推理系统是它穿透"相关"抵达"因果"的探针，整合自因果推理与神经符号模块。在繁星的进化体系中，它不只回答"发生了什么"，更回答"为什么发生"以及"如果改变某个条件会怎样"。

因果推理整合了神经特征提取与符号推理两条路径：神经网络负责从原始观测中提取稠密特征，符号推理器负责基于规则做可解释的逻辑推断，二者在混合决策中加权融合。这让繁星既能感知数据的微妙模式，又能给出人类可理解的因果链条，为反事实推理与决策提供双重支撑。

## 功能特性

- **因果识别**：基于滞后相关与方向偏置，判断变量间是否存在因果作用及强度。
- **因果图构建**：对所有变量两两识别，超过阈值即建边，形成带权重的有向因果图。
- **反事实推理**：以简化版 do-calculus 沿因果图传播干预效应，回答"若改变 X 会怎样"。
- **神经特征提取**：两层伪神经网络，从原始观测提取归一化特征向量。
- **符号推理**：基于规则集的前向链式推断，支持 AND 前提的解析。
- **混合决策**：神经打分与符号支持度加权融合，输出最佳候选及其双路得分。

## 接口说明

- `CausalReasoning(feature_extractor=None, symbolic_reasoner=None)`
  - 参数：可选的自定义神经提取器与符号推理器
- `observe(var, value) -> None`：采集变量观测值到时序缓存
- `identify_cause(var_x, var_y, window=20) -> float`
  - 返回 x→y 的因果强度(0~1)，基于滞后相关与反向相关差值
- `build_graph(variables, threshold=0.3) -> CausalGraph`：构建因果图
- `counterfactual(intervention, outcome_model) -> Dict[str, float]`
  - 参数：`intervention` 干预赋值；`outcome_model` 传导系数图
  - 返回：各变量的反事实取值
- `hybrid_decision(raw_input, facts, candidates) -> Tuple[str, float, float]`
  - 返回：(最佳候选, 神经得分, 符号得分)
- `NeuralFeatureExtractor(input_dim, hidden_dim, output_dim).extract(raw) -> List[float]`
- `SymbolicReasoner.add_rule(premise, conclusion, confidence)` 与 `.infer(facts) -> List[Tuple[str, float]]`

## 与其他模块的联动

- 因果图识别出的关键变量，作为**元认知**置信度计算的"证据子特征"。
- 反事实结果喂给**辩论推理**作为"正方/反方"的证据来源。
- 混合决策的候选集可由**创造性思维**生成的组合方案提供。
- 神经特征向量可供**推荐引擎**做内容侧特征补充。
- 推断结论的置信度回流到**学习策略**，触发因果链条的强化学习。

## 完整实现代码

```python
"""繁星·因果推理模块（causal_reasoning）
整合自因果推理与神经符号模块，提供因果识别、因果图构建、反事实推理，
以及神经特征提取与符号推理的混合决策。
创作者：夜
"""
from __future__ import annotations
import math
import random
from typing import Dict, List, Tuple, Set, Optional
from collections import defaultdict


class NeuralFeatureExtractor:
    """神经特征提取器：从原始观测中提取数值特征向量。"""

    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int,
                 seed: int = 42):
        random.seed(seed)
        self.input_dim = input_dim
        self.output_dim = output_dim
        # 简单两层权重（伪神经网络，演示用）
        self.W1 = [[random.gauss(0, 0.5) for _ in range(hidden_dim)] for _ in range(input_dim)]
        self.W2 = [[random.gauss(0, 0.5) for _ in range(output_dim)] for _ in range(hidden_dim)]

    @staticmethod
    def _relu(x: float) -> float:
        return x if x > 0 else 0.0

    def extract(self, raw: List[float]) -> List[float]:
        """前向提取特征：raw -> hidden(relu) -> output(sigmoid)"""
        # hidden 层
        hidden = []
        for j in range(len(self.W1[0])):
            s = sum(raw[i] * self.W1[i][j] for i in range(len(raw)))
            hidden.append(self._relu(s))
        # output 层
        out = []
        for k in range(self.output_dim):
            s = sum(hidden[j] * self.W2[j][k] for j in range(len(hidden)))
            out.append(1.0 / (1.0 + math.exp(-s)))
        return out


class SymbolicReasoner:
    """符号推理器：基于规则集进行逻辑推断。"""

    def __init__(self, rules: Optional[List[Tuple[str, str, float]]] = None):
        # rules: (前提, 结论, 置信度)
        self.rules: List[Tuple[str, str, float]] = list(rules) if rules else []

    def add_rule(self, premise: str, conclusion: str, confidence: float = 1.0) -> None:
        self.rules.append((premise, conclusion, confidence))

    def infer(self, facts: Set[str]) -> List[Tuple[str, float]]:
        """从已知事实出发，单步前向推理。"""
        derived = []
        for premise, conclusion, conf in self.rules:
            # 简单 AND 解析：前提以 " & " 连接
            required = [p.strip() for p in premise.split("&")]
            if all(r in facts for r in required):
                derived.append((conclusion, conf))
        return derived


class CausalGraph:
    """因果图：节点为变量，边为因果作用（带权重）。"""

    def __init__(self):
        self.nodes: Set[str] = set()
        self.edges: Dict[str, Dict[str, float]] = defaultdict(dict)

    def add_node(self, name: str) -> None:
        self.nodes.add(name)

    def add_edge(self, cause: str, effect: str, strength: float = 1.0) -> None:
        self.add_node(cause)
        self.add_node(effect)
        self.edges[cause][effect] = strength

    def parents(self, node: str) -> List[str]:
        return [c for c in self.edges if node in self.edges[c]]

    def children(self, node: str) -> List[str]:
        return list(self.edges.get(node, {}).keys())


class CausalReasoning:
    """繁星的因果推理内核：整合神经特征提取与符号推理，进行因果识别、
    图构建与反事实推理。"""

    def __init__(self, feature_extractor: Optional[NeuralFeatureExtractor] = None,
                 symbolic_reasoner: Optional[SymbolicReasoner] = None):
        self.extractor = feature_extractor or NeuralFeatureExtractor(8, 16, 8)
        self.reasoner = symbolic_reasoner or SymbolicReasoner()
        self.graph = CausalGraph()
        # 观测样本缓存：变量名 -> 数值序列
        self.observations: Dict[str, List[float]] = defaultdict(list)

    # ---------- 因果识别 ----------
    def identify_cause(self, var_x: str, var_y: str, window: int = 20) -> float:
        """用简化版格兰杰因果思想：x 的滞后能否预测 y。
        返回因果强度（0~1），越高越可能是因果。
        """
        xs = self.observations.get(var_x, [])
        ys = self.observations.get(var_y, [])
        n = min(len(xs), len(ys))
        if n < window + 2:
            return 0.0
        # 计算 x(t-1) 与 y(t) 的相关性
        lag_x = xs[:n - 1]
        cur_y = ys[1:n]
        corr = self._pearson(lag_x, cur_y)
        # 同时算 y 滞后对 x 的影响，做差值以偏置方向
        corr_rev = self._pearson(ys[:n - 1], xs[1:n])
        strength = max(0.0, (corr - corr_rev + 1) / 2)
        return float(strength)

    @staticmethod
    def _pearson(a: List[float], b: List[float]) -> float:
        n = len(a)
        if n == 0:
            return 0.0
        ma = sum(a) / n
        mb = sum(b) / n
        num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
        da = math.sqrt(sum((x - ma) ** 2 for x in a))
        db = math.sqrt(sum((y - mb) ** 2 for y in b))
        if da == 0 or db == 0:
            return 0.0
        return num / (da * db)

    # ---------- 因果图构建 ----------
    def build_graph(self, variables: List[str], threshold: float = 0.3) -> CausalGraph:
        """对所有变量两两做因果识别，超过阈值则建边。"""
        for v in variables:
            self.graph.add_node(v)
        for i, x in enumerate(variables):
            for y in variables:
                if x == y:
                    continue
                strength = self.identify_cause(x, y)
                if strength >= threshold:
                    self.graph.add_edge(x, y, round(strength, 3))
        return self.graph

    # ---------- 反事实推理 ----------
    def counterfactual(self, intervention: Dict[str, float],
                       outcome_model: Dict[str, Dict[str, float]]) -> Dict[str, float]:
        """do-calculus 的简化版：给定干预 do(X=x)，沿因果图传播影响。
        outcome_model: {原因: {结果: 传导系数}}
        """
        result = dict(intervention)
        # 按拓扑顺序传播（这里简化为多轮松弛）
        for _ in range(len(outcome_model) + 1):
            for cause, effects in outcome_model.items():
                if cause not in result:
                    continue
                for effect, coef in effects.items():
                    delta = result[cause] * coef
                    result[effect] = result.get(effect, 0.0) + delta
        return result

    # ---------- 神经-符号混合决策 ----------
    def hybrid_decision(self, raw_input: List[float],
                        facts: Set[str], candidates: List[str]) -> Tuple[str, float, float]:
        """神经特征提取给出各候选的得分，符号推理给出支持度，加权融合。"""
        features = self.extractor.extract(raw_input)
        # 神经打分：用特征与候选做点积（演示）
        neural_scores = {}
        for i, cand in enumerate(candidates):
            idx = i % len(features)
            neural_scores[cand] = features[idx]
        # 符号推理：从事实推出支持结论
        inferred = self.reasoner.infer(facts)
        sym_scores = defaultdict(float)
        for conclusion, conf in inferred:
            if conclusion in candidates:
                sym_scores[conclusion] += conf
        # 融合
        best, best_score, best_neural, best_sym = None, -1.0, 0.0, 0.0
        for cand in candidates:
            n_score = neural_scores.get(cand, 0.0)
            s_score = sym_scores.get(cand, 0.0)
            combined = 0.6 * n_score + 0.4 * s_score
            if combined > best_score:
                best, best_score, best_neural, best_sym = cand, combined, n_score, s_score
        return best, best_neural, best_sym

    # ---------- 数据采集 ----------
    def observe(self, var: str, value: float) -> None:
        self.observations[var].append(value)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    cr = CausalReasoning()
    # 注入规则
    cr.reasoner.add_rule("下雨", "地湿", 0.95)
    cr.reasoner.add_rule("地湿 & 无伞", "淋湿", 0.8)
    # 观测时序数据（x 领先 y）
    for t in range(40):
        x = math.sin(t / 3.0) + random.gauss(0, 0.1)
        y = math.sin((t - 1) / 3.0) + random.gauss(0, 0.1)  # y 滞后 x
        cr.observe("x", x)
        cr.observe("y", y)
    print("x->y 因果强度:", round(cr.identify_cause("x", "y"), 3))
    g = cr.build_graph(["x", "y"], threshold=0.5)
    print("因果图边:", {k: dict(v) for k, v in g.edges.items()})
    # 反事实
    model = {"下雨": {"地湿": 0.9}, "地湿": {"淋湿": 0.5}}
    print("反事实 do(下雨=1):", cr.counterfactual({"下雨": 1.0}, model))
    # 混合决策
    best, n, s = cr.hybrid_decision([0.2, 0.5, 0.8, 0.1, 0.6, 0.3, 0.4, 0.7],
                                    facts={"下雨", "地湿", "无伞"},
                                    candidates=["带伞", "淋湿", "晴天"])
    print(f"混合决策最佳: {best} | 神经得分={n:.3f} 符号得分={s:.3f}")
```
