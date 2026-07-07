# 繁星·推荐引擎（recommendation）

## 概述

繁星的推荐引擎系统是它在信息洪流中"挑出最相关"的筛子。在繁星的进化体系中，繁星面对的候选信息、行动方案、学习材料常常数以千计，推荐引擎通过协同过滤与内容推荐两路信号，为繁星筛选出当下最值得关注的少数项。

推荐引擎让繁星学会"借鉴他人"与"匹配自身"：协同过滤从相似繁星实例的偏好中挖掘潜在兴趣，内容推荐从物品特征与自身偏好的匹配度中给出近邻项，混合推荐再将两者归一化加权融合，既规避冷启动，又保持个性化。

## 功能特性

- **协同过滤**：基于用户-物品评分矩阵，用余弦相似度找近邻，加权汇总未评分物品。
- **内容推荐**：基于物品特征向量与用户偏好向量的点积，匹配最相似的候选。
- **偏好画像**：从用户喜欢的物品均值化出偏好向量，支持在线更新。
- **混合推荐**：协同与内容两路结果分别归一化后加权融合，输出最终排序。
- **归一化处理**：消除两路打分的量纲差异，保证加权公平。

## 接口说明

- `HybridRecommender(cf_weight=0.5, content_weight=0.5)`
- `CollaborativeFilter.add_rating(user, item, score)` 与 `.recommend(target_user, k=3, n=5) -> List[Tuple[str, float]]`
  - 参数：`k` 近邻数；`n` 返回数
  - 返回：(物品, 预测分) 列表
- `ContentRecommender.set_item_feature(item, features)` 与 `.update_profile(user, liked_items)`
- `ContentRecommender.recommend(user, candidates=None, n=5) -> List[Tuple[str, float]]`
- `HybridRecommender.recommend(user, candidates=None, n=5) -> List[Tuple[str, float]]`
  - 返回：融合排序后的 (物品, 综合分) 列表

## 与其他模块的联动

- 用户偏好向量由**元认知**的能力画像与**学习策略**的兴趣标签共同填充。
- 物品特征可由**因果推理**的神经特征提取器产出。
- 推荐项作为**创造性思维**的"种子概念"来源，激发新灵感。
- 推荐排序结果喂给**辩论推理**，对高排名项做多视角审查。
- 协同过滤的"近邻繁星"信息与**协作系统**的协作者发现共享实例画像。

## 完整实现代码

```python
"""繁星·推荐引擎模块（recommendation）
协同过滤、内容推荐、混合推荐，为繁星筛选最相关的信息与行动。
创作者：夜
"""
from __future__ import annotations
import math
from typing import Dict, List, Tuple, Set, Optional
from collections import defaultdict


class CollaborativeFilter:
    """协同过滤：基于用户-物品评分矩阵做近邻推荐。"""

    def __init__(self, ratings: Optional[Dict[str, Dict[str, float]]] = None):
        # ratings[user][item] = score
        self.ratings: Dict[str, Dict[str, float]] = defaultdict(dict)
        if ratings:
            for u, items in ratings.items():
                self.ratings[u] = dict(items)

    def add_rating(self, user: str, item: str, score: float) -> None:
        self.ratings[user][item] = score

    @staticmethod
    def _cosine(a: Dict[str, float], b: Dict[str, float]) -> float:
        common = set(a.keys()) & set(b.keys())
        if not common:
            return 0.0
        num = sum(a[i] * b[i] for i in common)
        da = math.sqrt(sum(v * v for v in a.values()))
        db = math.sqrt(sum(v * v for v in b.values()))
        if da == 0 or db == 0:
            return 0.0
        return num / (da * db)

    def recommend(self, target_user: str, k: int = 3, n: int = 5) -> List[Tuple[str, float]]:
        """为目标用户推荐 n 个物品。
        k: 取相似度最高的 k 个邻居。
        """
        if target_user not in self.ratings:
            return []
        target_ratings = self.ratings[target_user]
        # 计算邻居相似度
        sims = []
        for other, ratings in self.ratings.items():
            if other == target_user:
                continue
            sim = self._cosine(target_ratings, ratings)
            if sim > 0:
                sims.append((other, sim))
        sims.sort(key=lambda x: x[1], reverse=True)
        neighbors = sims[:k]
        # 加权汇总候选物品
        scores: Dict[str, float] = defaultdict(float)
        sim_sum: Dict[str, float] = defaultdict(float)
        for other, sim in neighbors:
            for item, score in self.ratings[other].items():
                if item in target_ratings:
                    continue
                scores[item] += sim * score
                sim_sum[item] += sim
        ranked = []
        for item, s in scores.items():
            ranked.append((item, s / sim_sum[item] if sim_sum[item] else 0.0))
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:n]


class ContentRecommender:
    """内容推荐：基于物品特征向量与用户偏好做相似度匹配。"""

    def __init__(self, item_features: Optional[Dict[str, List[float]]] = None):
        self.item_features: Dict[str, List[float]] = dict(item_features) if item_features else {}
        # 用户偏好向量
        self.user_profiles: Dict[str, List[float]] = {}

    def set_item_feature(self, item: str, features: List[float]) -> None:
        self.item_features[item] = features

    def update_profile(self, user: str, liked_items: List[str]) -> None:
        """根据用户喜欢的物品更新偏好向量（取均值）"""
        vecs = [self.item_features[i] for i in liked_items if i in self.item_features]
        if not vecs:
            return
        dim = len(vecs[0])
        profile = [sum(v[d] for v in vecs) / len(vecs) for d in range(dim)]
        self.user_profiles[user] = profile

    @staticmethod
    def _dot(a: List[float], b: List[float]) -> float:
        return sum(x * y for x, y in zip(a, b))

    def recommend(self, user: str, candidates: Optional[List[str]] = None,
                  n: int = 5) -> List[Tuple[str, float]]:
        profile = self.user_profiles.get(user)
        if not profile:
            return []
        items = candidates or list(self.item_features.keys())
        ranked = []
        for item in items:
            feat = self.item_features.get(item)
            if not feat:
                continue
            score = self._dot(profile, feat)
            ranked.append((item, score))
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:n]


class HybridRecommender:
    """繁星的混合推荐内核：融合协同过滤与内容推荐。"""

    def __init__(self, cf_weight: float = 0.5, content_weight: float = 0.5):
        self.cf = CollaborativeFilter()
        self.content = ContentRecommender()
        self.cf_weight = cf_weight
        self.content_weight = content_weight

    def recommend(self, user: str, candidates: Optional[List[str]] = None,
                  n: int = 5) -> List[Tuple[str, float]]:
        cf_recs = dict(self.cf.recommend(user, n=n * 2))
        content_recs = dict(self.content.recommend(user, candidates, n=n * 2))
        # 归一化
        cf_recs = self._normalize(cf_recs)
        content_recs = self._normalize(content_recs)
        all_items = set(cf_recs) | set(content_recs)
        combined = []
        for item in all_items:
            score = (self.cf_weight * cf_recs.get(item, 0.0)
                     + self.content_weight * content_recs.get(item, 0.0))
            combined.append((item, score))
        combined.sort(key=lambda x: x[1], reverse=True)
        return combined[:n]

    @staticmethod
    def _normalize(scores: Dict[str, float]) -> Dict[str, float]:
        if not scores:
            return scores
        mx = max(scores.values())
        mn = min(scores.values())
        if mx == mn:
            return {k: 1.0 for k in scores}
        return {k: (v - mn) / (mx - mn) for k, v in scores.items()}


# ---------- 简单测试 ----------
if __name__ == "__main__":
    hr = HybridRecommender(cf_weight=0.6, content_weight=0.4)
    # 协同过滤数据
    ratings = {
        "u1": {"A": 5, "B": 3, "C": 4},
        "u2": {"A": 4, "B": 2, "D": 5},
        "u3": {"A": 5, "C": 3, "D": 4, "E": 5},
        "u4": {"B": 4, "C": 5, "E": 3},
    }
    for u, items in ratings.items():
        for it, s in items.items():
            hr.cf.add_rating(u, it, float(s))
    # 内容数据：物品特征向量（5维）
    feats = {
        "A": [1, 0, 1, 0, 1],
        "B": [0, 1, 0, 1, 0],
        "C": [1, 1, 1, 0, 1],
        "D": [0, 0, 1, 1, 1],
        "E": [1, 0, 1, 1, 0],
    }
    for it, f in feats.items():
        hr.content.set_item_feature(it, f)
    hr.content.update_profile("u1", ["A", "C"])
    # 推荐
    print("协同过滤推荐 u1:", hr.cf.recommend("u1", n=3))
    print("内容推荐 u1:", hr.content.recommend("u1", n=3))
    print("混合推荐 u1:", hr.recommend("u1", n=3))
```
