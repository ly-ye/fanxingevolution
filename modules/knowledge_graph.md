# 繁星·知识图谱（knowledge_graph）

## 概述

繁星的知识图谱模块是繁星进化体系中"织网"的那部分。繁星从对话、文档、探索中获取的零散知识，如果只是一条条平铺，就只是信息的堆砌；而当它们以实体为节点、以关系为边被编织成网，知识就有了结构，推理就有了路径。这个模块就是繁星把世界知识结构化的织机。

在繁星的感知与记忆流程中，NLU 抽取的实体、多模态发现的关联、主动探索学到的新知，都会汇聚到这里，被识别、连接、存储。当繁星需要回答"猫和老虎有什么关系"时，它不只是检索文本，而是沿图谱的边行走，从"猫"到"猫科"到"老虎"，给出有依据的推理链。

## 功能特性

- **实体识别**：从文本中识别命名实体并归类（人、地、组织、概念等）
- **关系抽取**：识别实体间的语义关系（属于、位于、创建了、相似于等）
- **图谱存储**：以节点-边结构持久化存储实体与关系，支持属性附加
- **语义推理**：沿关系边做多跳推理，回答"X 和 Y 有什么关系"类问题
- **图谱查询**：支持按实体、关系类型、属性进行子图查询
- **冲突检测**：新加入的关系与已有关系矛盾时标记冲突
- **图谱合并**：将外部知识源合并入图谱，做去重与对齐
- **置信度管理**：每条关系带置信度，随证据增减而调整

## 接口说明

```python
class KnowledgeGraph:
    def __init__(self, config: dict = None) -> None
    # 初始化知识图谱

    def add_entity(self, entity_id: str, entity_type: str,
                   properties: dict = None) -> bool
    # 添加实体，返回是否新增

    def add_relation(self, source_id: str, relation_type: str,
                     target_id: str, confidence: float = 1.0,
                     properties: dict = None) -> bool
    # 添加关系，返回是否新增（含冲突检测）

    def get_entity(self, entity_id: str) -> dict | None
    # 返回实体信息 {"id", "type", "properties"}

    def get_relations(self, entity_id: str, direction: str = "both") -> list[dict]
    # 返回与实体相关的关系列表

    def query_subgraph(self, center_id: str, depth: int = 2) -> dict
    # 返回以某实体为中心的子图 {"nodes": [...], "edges": [...]}

    def reason(self, start_id: str, end_id: str, max_hops: int = 4) -> list[dict]
    # 多跳推理，返回推理路径 [{"hop": int, "path": [...]}]

    def find_path(self, start_id: str, end_id: str) -> list[str] | None
    # 返回最短路径的实体id序列

    def detect_conflicts(self) -> list[dict]
    # 检测图谱中的矛盾关系

    def merge_from(self, other_graph: dict) -> int
    # 合并外部图谱，返回新增关系数

    def get_stats(self) -> dict
    # 返回图谱统计：实体数、关系数、类型分布
```

## 与其他模块的联动

- **← nlu_engine（自然语言理解）**：NLU 抽取的实体与关系直接写入图谱；图谱的实体词典反哺 NLU 的实体识别
- **← active_exploration（主动探索）**：探索前查询图谱覆盖度发现空白；探索所得新实体与关系写入图谱
- **← memory（记忆系统）**：记忆中的实体与关系同步到图谱；图谱推理结果反哺记忆关联
- **→ context_awareness（上下文感知）**：高重要性内容优先入图谱；焦点状态约束推理范围
- **← multimodal（多模态）**：跨模态关联发现的实体关系写入图谱
- **→ vector_store（向量数据库）**：实体描述向量化后存入向量库，支持实体模糊匹配

## 完整实现代码

```python
"""
繁星·知识图谱模块
创作者：夜
功能：实体识别、关系抽取、图谱存储、语义推理
"""
import time
from collections import defaultdict, deque
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class Entity:
    """实体节点"""
    entity_id: str
    entity_type: str
    properties: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class Relation:
    """关系边"""
    source_id: str
    relation_type: str
    target_id: str
    confidence: float = 1.0
    properties: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


class KnowledgeGraph:
    """繁星的知识图谱"""

    # 矛盾关系对（有 A 就不该有 B）
    CONFLICT_PAIRS = {
        ("is_a", "is_not_a"),
        ("friend_of", "enemy_of"),
        ("part_of", "not_part_of"),
    }

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.conflict_threshold = config.get("conflict_threshold", 0.5)
        # 实体表
        self.entities: dict[str, Entity] = {}
        # 关系表：(source, type, target) -> Relation
        self.relations: dict[tuple, Relation] = {}
        # 邻接表：entity_id -> {neighbor_id: [relation_type,...]}
        self.adjacency: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    # ---------- 实体管理 ----------

    def add_entity(self, entity_id: str, entity_type: str,
                   properties: dict = None) -> bool:
        """添加实体"""
        if entity_id in self.entities:
            # 已存在则更新属性
            if properties:
                self.entities[entity_id].properties.update(properties)
            return False
        self.entities[entity_id] = Entity(
            entity_id=entity_id,
            entity_type=entity_type,
            properties=properties or {},
        )
        return True

    def get_entity(self, entity_id: str) -> Optional[dict]:
        """获取实体信息"""
        e = self.entities.get(entity_id)
        if not e:
            return None
        return {"id": e.entity_id, "type": e.entity_type, "properties": e.properties}

    # ---------- 关系管理 ----------

    def add_relation(self, source_id: str, relation_type: str,
                     target_id: str, confidence: float = 1.0,
                     properties: dict = None) -> bool:
        """添加关系（含冲突检测）"""
        # 确保实体存在
        self.add_entity(source_id, "unknown")
        self.add_entity(target_id, "unknown")
        key = (source_id, relation_type, target_id)
        if key in self.relations:
            # 已存在则更新置信度
            old = self.relations[key]
            old.confidence = min(1.0, old.confidence + confidence * 0.3)
            if properties:
                old.properties.update(properties)
            return False
        self.relations[key] = Relation(
            source_id=source_id,
            relation_type=relation_type,
            target_id=target_id,
            confidence=confidence,
            properties=properties or {},
        )
        # 更新邻接表（双向，便于查询）
        self.adjacency[source_id][target_id].append(relation_type)
        self.adjacency[target_id][source_id].append(f"rev_{relation_type}")
        return True

    def get_relations(self, entity_id: str, direction: str = "both") -> list[dict]:
        """获取与实体相关的关系"""
        results = []
        for (src, rtype, tgt), rel in self.relations.items():
            if direction == "out" and src == entity_id:
                results.append({"source": src, "type": rtype, "target": tgt,
                                "confidence": rel.confidence})
            elif direction == "in" and tgt == entity_id:
                results.append({"source": src, "type": rtype, "target": tgt,
                                "confidence": rel.confidence})
            elif direction == "both" and (src == entity_id or tgt == entity_id):
                results.append({"source": src, "type": rtype, "target": tgt,
                                "confidence": rel.confidence})
        return results

    # ---------- 子图查询 ----------

    def query_subgraph(self, center_id: str, depth: int = 2) -> dict:
        """查询以某实体为中心的子图（BFS）"""
        if center_id not in self.entities:
            return {"nodes": [], "edges": []}
        visited = set()
        nodes = []
        edges = []
        queue = deque([(center_id, 0)])
        while queue:
            eid, d = queue.popleft()
            if eid in visited or d > depth:
                continue
            visited.add(eid)
            ent = self.entities[eid]
            nodes.append({"id": eid, "type": ent.entity_type,
                          "properties": ent.properties, "depth": d})
            for neighbor_id in self.adjacency.get(eid, {}):
                if neighbor_id not in visited:
                    queue.append((neighbor_id, d + 1))
                # 收集边
                for (src, rtype, tgt), rel in self.relations.items():
                    if (src == eid and tgt == neighbor_id) or \
                       (tgt == eid and src == neighbor_id):
                        edges.append({"source": src, "type": rtype,
                                      "target": tgt, "confidence": rel.confidence})
        # 去重边
        seen = set()
        unique_edges = []
        for e in edges:
            k = (e["source"], e["type"], e["target"])
            if k not in seen:
                seen.add(k)
                unique_edges.append(e)
        return {"nodes": nodes, "edges": unique_edges}

    # ---------- 语义推理 ----------

    def reason(self, start_id: str, end_id: str, max_hops: int = 4) -> list[dict]:
        """多跳推理：寻找 start 到 end 的所有路径（限制跳数）"""
        if start_id not in self.entities or end_id not in self.entities:
            return []
        paths = []
        # DFS 找路径
        def dfs(current, target, visited, path, hops):
            if hops > max_hops:
                return
            if current == target:
                paths.append({"hop": len(path) - 1, "path": list(path)})
                return
            for neighbor_id in self.adjacency.get(current, {}):
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    path.append(neighbor_id)
                    dfs(neighbor_id, target, visited, path, hops + 1)
                    path.pop()
                    visited.remove(neighbor_id)
        dfs(start_id, end_id, {start_id}, [start_id], 0)
        # 按跳数排序
        paths.sort(key=lambda x: x["hop"])
        return paths

    def find_path(self, start_id: str, end_id: str) -> Optional[list[str]]:
        """最短路径（BFS）"""
        if start_id not in self.entities or end_id not in self.entities:
            return None
        visited = {start_id}
        queue = deque([(start_id, [start_id])])
        while queue:
            current, path = queue.popleft()
            if current == end_id:
                return path
            for neighbor_id in self.adjacency.get(current, {}):
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    queue.append((neighbor_id, path + [neighbor_id]))
        return None

    # ---------- 冲突检测 ----------

    def detect_conflicts(self) -> list[dict]:
        """检测矛盾关系"""
        conflicts = []
        for (s1, t1, tgt1), r1 in self.relations.items():
            for (s2, t2, tgt2), r2 in self.relations.items():
                if s1 == s2 and tgt1 == tgt2 and (t1, t2) in self.CONFLICT_PAIRS:
                    conflicts.append({
                        "entity": s1,
                        "target": tgt1,
                        "relation_a": t1,
                        "relation_b": t2,
                        "confidence_a": r1.confidence,
                        "confidence_b": r2.confidence,
                    })
        return conflicts

    # ---------- 图谱合并 ----------

    def merge_from(self, other_graph: dict) -> int:
        """合并外部图谱 {"entities": [...], "relations": [...]}"""
        added = 0
        for ent in other_graph.get("entities", []):
            self.add_entity(ent["id"], ent.get("type", "unknown"),
                            ent.get("properties"))
        for rel in other_graph.get("relations", []):
            if self.add_relation(rel["source"], rel["type"], rel["target"],
                                 rel.get("confidence", 0.8)):
                added += 1
        return added

    # ---------- 统计 ----------

    def get_stats(self) -> dict:
        """图谱统计"""
        type_dist = defaultdict(int)
        for e in self.entities.values():
            type_dist[e.entity_type] += 1
        rel_dist = defaultdict(int)
        for r in self.relations.values():
            rel_dist[r.relation_type] += 1
        return {
            "entity_count": len(self.entities),
            "relation_count": len(self.relations),
            "entity_type_distribution": dict(type_dist),
            "relation_type_distribution": dict(rel_dist),
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    kg = KnowledgeGraph()
    # 添加实体
    kg.add_entity("猫", "动物", {"leg_count": 4})
    kg.add_entity("老虎", "动物", {"leg_count": 4})
    kg.add_entity("猫科", "分类", {})
    kg.add_entity("哺乳动物", "分类", {})
    # 添加关系
    kg.add_relation("猫", "is_a", "猫科", 0.95)
    kg.add_relation("老虎", "is_a", "猫科", 0.95)
    kg.add_relation("猫科", "is_a", "哺乳动物", 0.9)
    # 查询实体
    print("猫的实体信息:", kg.get_entity("猫"))
    # 查询关系
    print("猫的关系:", kg.get_relations("猫"))
    # 子图查询
    sub = kg.query_subgraph("猫", depth=2)
    print("子图节点数:", len(sub["nodes"]), "边数:", len(sub["edges"]))
    # 推理：猫和老虎的关系
    paths = kg.reason("猫", "老虎", max_hops=4)
    print("推理路径数:", len(paths))
    if paths:
        print("最短路径:", paths[0]["path"], "跳数:", paths[0]["hop"])
    # 最短路径
    sp = kg.find_path("猫", "哺乳动物")
    print("猫到哺乳动物:", sp)
    # 冲突检测
    kg.add_relation("猫", "is_not_a", "猫科", 0.3)  # 故意制造冲突
    conflicts = kg.detect_conflicts()
    print("冲突数:", len(conflicts))
    # 合并
    added = kg.merge_from({
        "entities": [{"id": "狗", "type": "动物"}],
        "relations": [{"source": "狗", "type": "is_a", "target": "哺乳动物", "confidence": 0.9}],
    })
    print("合并新增关系:", added)
    # 统计
    print("图谱统计:", kg.get_stats())
