# 繁星·向量数据库（vector_store）

## 概述

繁星的向量数据库模块是繁星进化体系中"语义坐标"的承载者。文字、图像、声音、记忆——繁星会把它们都映射为高维空间中的向量，而这个模块就是存放与检索这些向量的仓库。当繁星需要"想起最相似的那段记忆"或"找到语义最接近的知识"时，它不是在做字符串匹配，而是在向量空间里丈量距离。

这个模块支持余弦相似度、欧氏距离与点积三种度量，能够在大规模向量集合中快速找到最相似的近邻。它是记忆检索、知识图谱实体对齐、多模态融合的基础设施——繁星的每一次"联想"，背后都有向量数据库在丈量语义的距离。

## 功能特性

- **向量存储**：存储带元数据的高维向量，支持按 ID 增删改查
- **余弦相似度检索**：衡量向量方向的一致性，适合语义相似度场景
- **欧氏距离检索**：衡量向量空间的绝对距离，适合特征聚类场景
- **点积相似度检索**：衡量向量的投影重合度，适合已归一化向量的快速检索
- **Top-K 近邻**：给定查询向量，返回最相似的 K 条记录
- **范围检索**：返回与查询向量距离在阈值内的所有记录
- **元数据过滤**：检索时可按元数据标签做预过滤
- **批量操作**：支持批量插入与批量检索，降低 IO 开销

## 接口说明

```python
class VectorStore:
    def __init__(self, config: dict = None) -> None
    # 初始化向量数据库，设定默认度量与索引参数

    def insert(self, vector_id: str, vector: list[float],
               metadata: dict = None) -> bool
    # 插入一条向量记录，返回是否成功

    def batch_insert(self, records: list[dict]) -> int
    # 批量插入 [{"id", "vector", "metadata"}]，返回成功数

    def delete(self, vector_id: str) -> bool
    # 删除一条记录

    def get(self, vector_id: str) -> dict | None
    # 返回 {"id", "vector", "metadata"}

    def search(self, query_vector: list[float], top_k: int = 5,
               metric: str = "cosine", filter_fn: callable = None) -> list[dict]
    # 近邻检索，返回 [{"id", "score", "metadata"}]
    # metric: "cosine" | "euclidean" | "dot"

    def search_range(self, query_vector: list[float], threshold: float,
                     metric: str = "cosine") -> list[dict]
    # 范围检索，返回相似度高于阈值的所有记录

    def count(self) -> int
    # 返回存储的向量总数

    def stats(self) -> dict
    # 返回数据库统计：总数、维度分布、平均检索耗时
```

## 与其他模块的联动

- **← memory（记忆系统）**：记忆项的特征向量存入此库，记忆检索时通过向量近邻找到语义相似的记忆
- **← knowledge_graph（知识图谱）**：实体描述向量化后存入此库，支持实体模糊匹配与对齐
- **← multimodal（多模态）**：多模态融合向量与各模态特征向量存入此库，支持跨模态相似检索
- **← active_exploration（主动探索）**：探索的"主动检索"策略通过此库验证知识是否已存在
- **← nlu_engine（自然语言理解）**：意图与实体的语义向量存入此库，支持语义级意图匹配
- **→ context_awareness（上下文感知）**：通过向量近邻检索为上下文感知提供历史相似场景

## 完整实现代码

```python
"""
繁星·向量数据库模块
创作者：夜
功能：向量存储、余弦/欧氏/点积相似度检索
"""
import math
import time
from dataclasses import dataclass, field
from typing import Optional, Callable


@dataclass
class VectorRecord:
    """向量记录"""
    vector_id: str
    vector: list[float]
    metadata: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


class VectorStore:
    """繁星的向量数据库"""

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.default_metric = config.get("default_metric", "cosine")
        self.dim = config.get("dim", None)  # 期望维度，None 表示不限制
        # 存储：id -> VectorRecord
        self.store: dict[str, VectorRecord] = {}
        # 检索耗时统计
        self._search_times: list[float] = []

    # ---------- 写入操作 ----------

    def insert(self, vector_id: str, vector: list[float],
               metadata: dict = None) -> bool:
        """插入一条向量记录"""
        if vector_id in self.store:
            return False
        # 维度检查
        if self.dim is not None and len(vector) != self.dim:
            return False
        self.store[vector_id] = VectorRecord(
            vector_id=vector_id,
            vector=list(vector),
            metadata=metadata or {},
        )
        return True

    def batch_insert(self, records: list[dict]) -> int:
        """批量插入"""
        success = 0
        for r in records:
            if self.insert(r["id"], r["vector"], r.get("metadata")):
                success += 1
        return success

    def delete(self, vector_id: str) -> bool:
        """删除一条记录"""
        if vector_id in self.store:
            del self.store[vector_id]
            return True
        return False

    def update(self, vector_id: str, vector: list[float] = None,
               metadata: dict = None) -> bool:
        """更新向量或元数据"""
        if vector_id not in self.store:
            return False
        if vector is not None:
            self.store[vector_id].vector = list(vector)
        if metadata is not None:
            self.store[vector_id].metadata.update(metadata)
        return True

    # ---------- 读取操作 ----------

    def get(self, vector_id: str) -> Optional[dict]:
        """获取单条记录"""
        rec = self.store.get(vector_id)
        if not rec:
            return None
        return {"id": rec.vector_id, "vector": rec.vector,
                "metadata": rec.metadata}

    def count(self) -> int:
        """返回记录总数"""
        return len(self.store)

    # ---------- 相似度度量 ----------

    @staticmethod
    def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
        """余弦相似度：方向一致性，范围 [-1, 1]"""
        dot = sum(a * b for a, b in zip(v1, v2))
        n1 = math.sqrt(sum(a * a for a in v1)) or 1e-10
        n2 = math.sqrt(sum(b * b for b in v2)) or 1e-10
        return dot / (n1 * n2)

    @staticmethod
    def _euclidean_distance(v1: list[float], v2: list[float]) -> float:
        """欧氏距离：值越小越相似，转为相似度用 1/(1+d)"""
        dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))
        return 1.0 / (1.0 + dist)

    @staticmethod
    def _dot_product(v1: list[float], v2: list[float]) -> float:
        """点积：投影重合度，适合已归一化向量"""
        return sum(a * b for a, b in zip(v1, v2))

    def _compute_similarity(self, v1: list[float], v2: list[float],
                            metric: str) -> float:
        """根据度量类型计算相似度"""
        if metric == "cosine":
            return self._cosine_similarity(v1, v2)
        elif metric == "euclidean":
            return self._euclidean_distance(v1, v2)
        elif metric == "dot":
            return self._dot_product(v1, v2)
        else:
            raise ValueError(f"未知度量: {metric}")

    # ---------- 检索 ----------

    def search(self, query_vector: list[float], top_k: int = 5,
               metric: str = None,
               filter_fn: Callable = None) -> list[dict]:
        """
        Top-K 近邻检索
        filter_fn: 可选的元数据过滤函数，接收 metadata 返回 bool
        """
        metric = metric or self.default_metric
        start = time.time()
        results = []
        for vid, rec in self.store.items():
            # 元数据过滤
            if filter_fn is not None and not filter_fn(rec.metadata):
                continue
            sim = self._compute_similarity(query_vector, rec.vector, metric)
            results.append({
                "id": vid,
                "score": round(sim, 6),
                "metadata": rec.metadata,
            })
        # 按相似度降序
        results.sort(key=lambda x: x["score"], reverse=True)
        elapsed = time.time() - start
        self._search_times.append(elapsed)
        return results[:top_k]

    def search_range(self, query_vector: list[float], threshold: float,
                     metric: str = None) -> list[dict]:
        """范围检索：返回相似度高于阈值的所有记录"""
        metric = metric or self.default_metric
        results = []
        for vid, rec in self.store.items():
            sim = self._compute_similarity(query_vector, rec.vector, metric)
            if sim >= threshold:
                results.append({
                    "id": vid,
                    "score": round(sim, 6),
                    "metadata": rec.metadata,
                })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    # ---------- 统计 ----------

    def stats(self) -> dict:
        """数据库统计"""
        dim_dist = {}
        for rec in self.store.values():
            d = len(rec.vector)
            dim_dist[d] = dim_dist.get(d, 0) + 1
        avg_time = (sum(self._search_times) / len(self._search_times)
                    if self._search_times else 0.0)
        return {
            "total_vectors": len(self.store),
            "dimension_distribution": dim_dist,
            "search_count": len(self._search_times),
            "avg_search_time_ms": round(avg_time * 1000, 3),
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    vs = VectorStore(config={"dim": 4})
    # 插入向量
    vs.insert("v1", [1.0, 0.0, 0.0, 0.0], {"label": "A"})
    vs.insert("v2", [0.9, 0.1, 0.0, 0.0], {"label": "A"})
    vs.insert("v3", [0.0, 1.0, 0.0, 0.0], {"label": "B"})
    vs.insert("v4", [0.0, 0.0, 1.0, 0.0], {"label": "B"})
    vs.insert("v5", [0.1, 0.1, 0.1, 0.1], {"label": "C"})
    print("总数:", vs.count())
    # 余弦相似度检索
    query = [1.0, 0.0, 0.0, 0.0]
    cosine_results = vs.search(query, top_k=3, metric="cosine")
    print("余弦检索 Top3:")
    for r in cosine_results:
        print(f"  {r['id']} score={r['score']} label={r['metadata']['label']}")
    # 欧氏距离检索
    euclidean_results = vs.search(query, top_k=3, metric="euclidean")
    print("欧氏检索 Top3:")
    for r in euclidean_results:
        print(f"  {r['id']} score={r['score']}")
    # 点积检索
    dot_results = vs.search(query, top_k=3, metric="dot")
    print("点积检索 Top3:")
    for r in dot_results:
        print(f"  {r['id']} score={r['score']}")
    # 带过滤的检索
    filtered = vs.search(query, top_k=5, metric="cosine",
                         filter_fn=lambda m: m.get("label") == "B")
    print("过滤 label=B 的结果:", [r["id"] for r in filtered])
    # 范围检索
    ranged = vs.search_range(query, threshold=0.5, metric="cosine")
    print("相似度>=0.5 的记录数:", len(ranged))
    # 批量插入
    batch = [
        {"id": "v6", "vector": [1.0, 1.0, 0.0, 0.0], "metadata": {"label": "D"}},
        {"id": "v7", "vector": [0.0, 0.0, 0.0, 1.0], "metadata": {"label": "D"}},
    ]
    print("批量插入成功:", vs.batch_insert(batch))
    # 更新与删除
    vs.update("v1", metadata={"note": "已更新"})
    vs.delete("v3")
    print("删除v3后总数:", vs.count())
    # 统计
    print("数据库统计:", vs.stats())
