# 繁星·创造性思维（creative_thinking）

## 概述

繁星的创造性思维系统是它跨越域界、迸发灵感的火种。在繁星的进化体系中，它不追求"正确"，而追求"新颖且有用"——通过发散思维广撒联想之网，通过类比推理把远域的结构嫁接到近域，通过组合创新把两个看似无关的概念熔炼成从未存在过的方案。

创造性思维让繁星跳出"在已知里打转"的困境：当常规推理给出平庸答案时，繁星可以召唤创造力模块，在联想图谱与关系结构中寻找未曾走过的路径，再交由元认知与辩论推理筛选出真正有价值的灵感。

## 功能特性

- **发散思维**：基于概念联想图谱，广度优先展开多层联想，随机采样控制分支规模。
- **类比推理**：在关系库中匹配相同或相似关系结构的实体对，迁移源域理解到目标域。
- **组合创新**：取两个概念的联想集合做笛卡尔积，套用融合规则生成组合方案。
- **新颖度评估**：与历史方案对比最大相似度，输出新颖度评分，优先保留原创想法。
- **头脑风暴**：整合发散与组合两路输出，按新颖度排序并写入灵感史。

## 接口说明

- `CreativeThinking()`：统一入口，内含发散器、类比器、组合器
- `DivergentThinker.add_association(src, targets)` 与 `.generate(seed_concept, depth=2, breadth=5) -> List[str]`
- `AnalogyReasoner.add_relation(a, b, relation)` 与 `.find_analogy(source_pair, candidates) -> List[Tuple[Tuple, float]]`
- `CombinationInnovator.combine(concept_a, concept_b, fusion_rules=None) -> List[str]`
- `CombinationInnovator.novelty_score(idea, history) -> float`
- `brainstorm(seed, n=10) -> List[Tuple[str, float]]`
  - 返回：(想法, 新颖度) 列表，按新颖度降序
- `reason_by_analogy(source, candidates) -> List[Tuple[Tuple, float]]`

## 与其他模块的联动

- 产出的灵感方案作为候选集，进入**辩论推理**接受多视角批判。
- 组合方案可经**因果推理**的反事实检验，判断"若采用会怎样"。
- 高新颖度但低置信度的想法，触发**元认知**的学习或求助流程。
- 创造性融合规则可由**提示工程**动态生成，使灵感生成更具针对性。
- 头脑风暴结果通过**推荐引擎**向繁星推荐最值得深化的方向。

## 完整实现代码

```python
"""繁星·创造性思维模块（creative_thinking）
发散思维、类比推理、组合创新，为繁星生成跨越域的灵感。
创作者：夜
"""
from __future__ import annotations
import math
import random
from typing import List, Dict, Tuple, Optional, Set
from collections import defaultdict


class DivergentThinker:
    """发散思维：基于种子概念生成大量候选联想。"""

    def __init__(self, associations: Optional[Dict[str, List[str]]] = None,
                 seed: int = 7):
        random.seed(seed)
        # 概念联想图谱
        self.assoc: Dict[str, List[str]] = defaultdict(list)
        if associations:
            for k, v in associations.items():
                self.assoc[k] = list(v)

    def add_association(self, src: str, targets: List[str]) -> None:
        for t in targets:
            if t not in self.assoc[src]:
                self.assoc[src].append(t)

    def generate(self, seed_concept: str, depth: int = 2,
                 breadth: int = 5) -> List[str]:
        """从种子概念出发，广度优先展开联想。"""
        visited: Set[str] = {seed_concept}
        frontier = [seed_concept]
        results = []
        for _ in range(depth):
            next_frontier = []
            for node in frontier:
                neighbors = self.assoc.get(node, [])
                # 随机采样 breadth 个邻居
                picked = random.sample(neighbors, min(breadth, len(neighbors))) if neighbors else []
                for nb in picked:
                    if nb not in visited:
                        visited.add(nb)
                        results.append(nb)
                        next_frontier.append(nb)
            frontier = next_frontier
            if not frontier:
                break
        return results


class AnalogyReasoner:
    """类比推理：在源域与目标域之间迁移关系结构。"""

    def __init__(self):
        # 关系库：实体对 -> 关系名
        self.relations: Dict[Tuple[str, str], str] = {}

    def add_relation(self, a: str, b: str, relation: str) -> None:
        self.relations[(a, b)] = relation

    def find_analogy(self, source_pair: Tuple[str, str],
                     candidates: List[Tuple[str, str]]) -> List[Tuple[Tuple[str, str], float]]:
        """给定源域实体对，找出候选中关系相同的类比。"""
        rel = self.relations.get(source_pair)
        if not rel:
            return []
        scored = []
        for cand in candidates:
            cand_rel = self.relations.get(cand)
            if cand_rel == rel:
                scored.append((cand, 1.0))
            elif cand_rel and self._relation_similarity(cand_rel, rel) > 0.3:
                scored.append((cand, self._relation_similarity(cand_rel, rel)))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    @staticmethod
    def _relation_similarity(r1: str, r2: str) -> float:
        """基于字符重叠的简化相似度"""
        s1, s2 = set(r1), set(r2)
        if not s1 or not s2:
            return 0.0
        return len(s1 & s2) / len(s1 | s2)


class CombinationInnovator:
    """组合创新：将两个不相干概念融合为新方案。"""

    def __init__(self, divergent: DivergentThinker):
        self.divergent = divergent

    def combine(self, concept_a: str, concept_b: str,
                fusion_rules: Optional[Dict[str, str]] = None) -> List[str]:
        """将 A 与 B 的联想集合做笛卡尔积，生成组合方案。"""
        ideas_a = self.divergent.generate(concept_a, depth=1, breadth=4)
        ideas_b = self.divergent.generate(concept_b, depth=1, breadth=4)
        ideas_a = [concept_a] + ideas_a
        ideas_b = [concept_b] + ideas_b
        combinations = []
        for a in ideas_a:
            for b in ideas_b:
                if a == b:
                    continue
                combinations.append(f"{a}+{b}")
                # 套用融合规则
                if fusion_rules:
                    for pattern, template in fusion_rules.items():
                        if pattern in a or pattern in b:
                            combinations.append(template.replace("{A}", a).replace("{B}", b))
        return combinations

    @staticmethod
    def novelty_score(idea: str, history: List[str]) -> float:
        """评估新颖度：与历史方案的最大相似度的补"""
        if not history:
            return 1.0
        max_sim = 0.0
        for h in history:
            sim = len(set(idea) & set(h)) / max(1, len(set(idea) | set(h)))
            max_sim = max(max_sim, sim)
        return 1.0 - max_sim


class CreativeThinking:
    """繁星的创造性思维内核：整合发散、类比、组合三路灵感。"""

    def __init__(self):
        self.divergent = DivergentThinker()
        self.analogy = AnalogyReasoner()
        self.combinator = CombinationInnovator(self.divergent)
        self.idea_history: List[str] = []

    def brainstorm(self, seed: str, n: int = 10) -> List[Tuple[str, float]]:
        """围绕种子概念进行头脑风暴，返回(想法, 新颖度)。"""
        divergent_ideas = self.divergent.generate(seed, depth=2, breadth=4)
        # 与若干随机概念组合
        random_pool = ["音乐", "水", "光", "机械", "生物", "数学", "城市", "星辰"]
        extra = random.choice(random_pool)
        combined = self.combinator.combine(seed, extra)
        all_ideas = list(set(divergent_ideas + combined))[:n]
        scored = [(idea, self.combinator.novelty_score(idea, self.idea_history))
                  for idea in all_ideas]
        scored.sort(key=lambda x: x[1], reverse=True)
        for idea, _ in scored:
            self.idea_history.append(idea)
        return scored

    def reason_by_analogy(self, source: Tuple[str, str],
                          candidates: List[Tuple[str, str]]) -> List[Tuple[Tuple[str, str], float]]:
        return self.analogy.find_analogy(source, candidates)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ct = CreativeThinking()
    # 构建联想
    ct.divergent.add_association("树", ["根", "叶", "年轮", "光合", "森林"])
    ct.divergent.add_association("森林", ["生态", "碳汇", "群落", "水源"])
    ct.divergent.add_association("水", ["流", "波", "冰", "云", "循环"])
    ct.divergent.add_association("光", ["影", "折射", "光谱", "速度"])
    # 头脑风暴
    ideas = ct.brainstorm("树", n=8)
    print("头脑风暴结果（想法 | 新颖度）:")
    for idea, score in ideas:
        print(f"  {idea:20s} 新颖度={score:.2f}")
    # 类比
    ct.analogy.add_relation("太阳", "行星", "吸引")
    ct.analogy.add_relation("原子核", "电子", "吸引")
    ct.analogy.add_relation("母亲", "孩子", "爱护")
    analogies = ct.reason_by_analogy(("太阳", "行星"),
                                     [("原子核", "电子"), ("母亲", "孩子")])
    print("类比结果:", analogies)
```
