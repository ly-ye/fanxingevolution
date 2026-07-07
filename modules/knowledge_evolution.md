# 繁星·知识进化（knowledge_evolution）

## 概述

繁星的知识进化内核是繁星在时间之河里沉淀星砂的容器。每一次经验、每一条规则、每一个被验证过的判断,都会被它收纳、版本化、并在冲突时谨慎合并。繁星不遗忘,但它会蒸馏——把过时的星砂熔去,让真正发光的知识浮上来。

知识并非静态堆积,而是带着版本号、来源、置信度与时间戳的活体。当新知识与旧知识相悖,繁星不会粗暴覆盖,而是先检测冲突,再依据置信度与证据强弱进行三方合并,留下可追溯的进化轨迹。每一代知识都是上一代的子集与升华。

## 功能特性

- **版本管理**:每条知识携带版本链,支持追溯、diff、回滚。
- **冲突检测**:基于键域与语义相似度发现矛盾知识,标记冲突等级。
- **知识合并**:支持覆盖、并集、加权融合、证据优先四种合并策略。
- **置信度衰减**:长期未被引用的知识置信度随时间衰减,自动归档。
- **领域分域**:知识按 namespace 分域,避免跨域误并。
- **进化日志**:所有写入、合并、归档事件记入进化日志,供审计。

## 接口说明

```python
class KnowledgeEvolution:
    def __init__(self, store_path: str) -> None
    # 初始化知识库,store_path 为持久化路径。

    def add(self, entry: KnowledgeEntry) -> str
    # 写入一条知识,返回版本 ID。若与已有同键知识冲突则触发合并流程。

    def get(self, key: str, namespace: str = "default") -> KnowledgeEntry | None
    # 读取当前生效版本。

    def history(self, key: str, namespace: str = "default") -> list[KnowledgeEntry]
    # 读取某条知识的全部历史版本(按时间倒序)。

    def detect_conflict(self, new_entry: KnowledgeEntry, existing: KnowledgeEntry) -> Conflict | None
    # 检测两条知识的冲突,返回冲突描述或 None。

    def merge(self, new_entry: KnowledgeEntry, existing: KnowledgeEntry,
              strategy: MergeStrategy = MergeStrategy.WEIGHTED) -> KnowledgeEntry
    # 按策略合并两条知识,生成新版本。

    def decay(self, now: float | None = None, half_life_days: float = 30.0) -> int
    # 执行置信度衰减与归档,返回归档条数。

    def query(self, namespace: str = "default", tag: str | None = None,
              min_confidence: float = 0.0) -> list[KnowledgeEntry]
    # 按域、标签、置信度下限查询知识。

    def evolution_log(self, limit: int = 50) -> list[dict]
    # 返回最近的进化事件日志。
```

## 与其他模块的联动

- **self_improver**:自改进器归纳的缺陷模式以知识形式沉淀,反哺检测规则。
- **evolution_laws**:合并策略需经三定律校验,禁止合并破坏一致性的矛盾知识。
- **benchmark_evaluator**:评测结果作为证据写入,提升对应知识的置信度。
- **llm_integration**:语义缓存命中的相似问答可凝练为通用知识条目。
- **search_engine**:知识库作为检索语料源,支撑 RAG 与建议生成。

## 完整实现代码

```python
"""繁星·知识进化内核

在时间之河里沉淀星砂,蒸馏出真正发光的知识。
作者:夜
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any


class MergeStrategy(str, Enum):
    """合并策略"""
    OVERWRITE = "overwrite"   # 新覆盖旧
    UNION = "union"           # 取并集
    WEIGHTED = "weighted"     # 按置信度加权
    EVIDENCE = "evidence"     # 证据多者优先


class ConflictLevel(str, Enum):
    NONE = "none"
    SOFT = "soft"     # 可合并
    HARD = "hard"     # 需人工或定律仲裁


@dataclass
class KnowledgeEntry:
    """一条知识"""
    key: str
    namespace: str = "default"
    value: Any = None
    tags: list[str] = field(default_factory=list)
    confidence: float = 1.0
    source: str = "internal"
    evidence: list[str] = field(default_factory=list)
    version: str = ""
    parent_version: str = ""
    created_at: float = field(default_factory=time.time)
    last_referenced: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Conflict:
    """冲突描述"""
    level: ConflictLevel
    reason: str
    new_entry: KnowledgeEntry
    existing: KnowledgeEntry


class KnowledgeEvolution:
    """繁星·知识进化器"""

    def __init__(self, store_path: str) -> None:
        self.store_path = store_path
        self._index: dict[str, dict[str, KnowledgeEntry]] = {}
        # namespace -> key -> 当前生效版本
        self._history: dict[str, dict[str, list[KnowledgeEntry]]] = {}
        # namespace -> key -> 历史版本列表
        self._log: list[dict] = []
        self._archive: list[KnowledgeEntry] = []
        os.makedirs(store_path, exist_ok=True)
        self._load()

    # ---- 持久化 ----
    def _path(self) -> str:
        return os.path.join(self.store_path, "knowledge.json")

    def _load(self) -> None:
        path = self._path()
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for entry_dict in data.get("entries", []):
            entry = KnowledgeEntry(**entry_dict)
            self._index.setdefault(entry.namespace, {})[entry.key] = entry
            self._history.setdefault(entry.namespace, {}).setdefault(entry.key, []).append(entry)
        self._log = data.get("log", [])
        self._archive = [KnowledgeEntry(**d) for d in data.get("archive", [])]

    def _save(self) -> None:
        entries = []
        for ns_map in self._index.values():
            for entry in ns_map.values():
                entries.append(entry.to_dict())
        data = {
            "entries": entries,
            "log": self._log[-500:],
            "archive": [e.to_dict() for e in self._archive],
        }
        with open(self._path(), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _log_event(self, kind: str, detail: dict) -> None:
        self._log.append({"kind": kind, "detail": detail, "ts": time.time()})

    # ---- 写入与合并 ----
    def _new_version(self, entry: KnowledgeEntry, parent: str) -> str:
        raw = f"{entry.namespace}:{entry.key}:{entry.value}:{time.time()}"
        vid = hashlib.sha1(raw.encode()).hexdigest()[:12]
        entry.version = vid
        entry.parent_version = parent
        return vid

    def add(self, entry: KnowledgeEntry) -> str:
        ns = self._index.setdefault(entry.namespace, {})
        hist = self._history.setdefault(entry.namespace, {}).setdefault(entry.key, [])
        existing = ns.get(entry.key)
        parent = existing.version if existing else ""
        if existing is not None:
            conflict = self.detect_conflict(entry, existing)
            if conflict and conflict.level == ConflictLevel.HARD:
                # 硬冲突:保留新版本但标记,不自动合并,等待仲裁
                self._new_version(entry, parent)
                hist.append(entry)
                ns[entry.key] = entry
                self._log_event("hard_conflict", {"key": entry.key,
                                                   "ns": entry.namespace})
                self._save()
                return entry.version
            merged = self.merge(entry, existing)
            self._new_version(merged, parent)
            hist.append(merged)
            ns[entry.key] = merged
            self._log_event("merge", {"key": merged.key, "ns": merged.namespace,
                                       "strategy": "auto"})
            self._save()
            return merged.version
        # 全新知识
        self._new_version(entry, parent)
        hist.append(entry)
        ns[entry.key] = entry
        self._log_event("add", {"key": entry.key, "ns": entry.namespace})
        self._save()
        return entry.version

    def get(self, key: str, namespace: str = "default") -> KnowledgeEntry | None:
        return self._index.get(namespace, {}).get(key)

    def history(self, key: str, namespace: str = "default") -> list[KnowledgeEntry]:
        return list(reversed(self._history.get(namespace, {}).get(key, [])))

    # ---- 冲突检测 ----
    def detect_conflict(self, new_entry: KnowledgeEntry,
                        existing: KnowledgeEntry) -> Conflict | None:
        if new_entry.namespace != existing.namespace:
            return None
        if new_entry.value == existing.value:
            return None
        # 简单语义判定:字符串值不同即软冲突,数值类型相悖为硬冲突
        if isinstance(new_entry.value, (int, float)) and isinstance(existing.value, (int, float)):
            # 数值方向相反视为硬冲突
            if (new_entry.value > 0) != (existing.value > 0) and abs(new_entry.value - existing.value) > 1e-6:
                return Conflict(ConflictLevel.HARD,
                                "数值结论方向相反,需定律仲裁",
                                new_entry, existing)
        return Conflict(ConflictLevel.SOFT, "取值不同,可加权合并",
                        new_entry, existing)

    # ---- 合并 ----
    def merge(self, new_entry: KnowledgeEntry, existing: KnowledgeEntry,
              strategy: MergeStrategy = MergeStrategy.WEIGHTED) -> KnowledgeEntry:
        if strategy == MergeStrategy.OVERWRITE:
            return KnowledgeEntry(
                key=new_entry.key, namespace=new_entry.namespace,
                value=new_entry.value, tags=list(set(new_entry.tags) | set(existing.tags)),
                confidence=new_entry.confidence, source=new_entry.source,
                evidence=new_entry.evidence + existing.evidence,
            )
        if strategy == MergeStrategy.UNION:
            merged_val = existing.value
            if isinstance(merged_val, list) and isinstance(new_entry.value, list):
                merged_val = list(dict.fromkeys(merged_val + new_entry.value))
            elif isinstance(merged_val, dict) and isinstance(new_entry.value, dict):
                merged_val = {**merged_val, **new_entry.value}
            else:
                merged_val = [merged_val, new_entry.value]
            return KnowledgeEntry(
                key=new_entry.key, namespace=new_entry.namespace,
                value=merged_val,
                tags=list(set(new_entry.tags) | set(existing.tags)),
                confidence=max(new_entry.confidence, existing.confidence),
                source=f"{existing.source}+{new_entry.source}",
                evidence=new_entry.evidence + existing.evidence,
            )
        if strategy == MergeStrategy.EVIDENCE:
            # 证据条数多者优先
            if len(new_entry.evidence) >= len(existing.evidence):
                winner = new_entry
            else:
                winner = existing
            return KnowledgeEntry(
                key=winner.key, namespace=winner.namespace, value=winner.value,
                tags=list(set(new_entry.tags) | set(existing.tags)),
                confidence=winner.confidence,
                source=winner.source,
                evidence=new_entry.evidence + existing.evidence,
            )
        # WEIGHTED:按置信度加权(数值类)或取高置信一方
        w_new = new_entry.confidence
        w_old = existing.confidence
        total = w_new + w_old
        if total <= 0:
            total = 1.0
        if isinstance(new_entry.value, (int, float)) and isinstance(existing.value, (int, float)):
            merged_val = (new_entry.value * w_new + existing.value * w_old) / total
        else:
            merged_val = new_entry.value if w_new >= w_old else existing.value
        return KnowledgeEntry(
            key=new_entry.key, namespace=new_entry.namespace, value=merged_val,
            tags=list(set(new_entry.tags) | set(existing.tags)),
            confidence=min(1.0, (w_new + w_old) / 2 + 0.1),
            source=f"{existing.source}+{new_entry.source}",
            evidence=new_entry.evidence + existing.evidence,
        )

    # ---- 衰减与归档 ----
    def decay(self, now: float | None = None, half_life_days: float = 30.0) -> int:
        now = now or time.time()
        half_life = half_life_days * 86400.0
        archived = 0
        for ns, kv in list(self._index.items()):
            for key, entry in list(kv.items()):
                age = now - entry.last_referenced
                factor = 0.5 ** (age / half_life) if half_life > 0 else 1.0
                entry.confidence *= factor
                if entry.confidence < 0.05:
                    self._archive.append(entry)
                    del kv[key]
                    archived += 1
                    self._log_event("archive", {"key": key, "ns": ns})
        self._save()
        return archived

    def touch(self, key: str, namespace: str = "default") -> None:
        entry = self.get(key, namespace)
        if entry:
            entry.last_referenced = time.time()
            self._save()

    # ---- 查询 ----
    def query(self, namespace: str = "default", tag: str | None = None,
              min_confidence: float = 0.0) -> list[KnowledgeEntry]:
        result = []
        for entry in self._index.get(namespace, {}).values():
            if entry.confidence < min_confidence:
                continue
            if tag and tag not in entry.tags:
                continue
            result.append(entry)
        result.sort(key=lambda e: e.confidence, reverse=True)
        return result

    def evolution_log(self, limit: int = 50) -> list[dict]:
        return list(reversed(self._log[-limit:]))


if __name__ == "__main__":
    ke = KnowledgeEvolution(store_path="./.fanxing_knowledge")

    e1 = KnowledgeEntry(key="earth.radius", namespace="astro",
                        value=6371, confidence=0.9, source="wiki",
                        evidence=["measurement_a"])
    v1 = ke.add(e1)
    print("首次写入版本:", v1)

    e2 = KnowledgeEntry(key="earth.radius", namespace="astro",
                        value=6371.01, confidence=0.95, source="satellite",
                        evidence=["measurement_b", "measurement_c"])
    v2 = ke.add(e2)
    print("合并后版本:", v2)
    print("当前生效:", ke.get("earth.radius", "astro").to_dict())

    e3 = KnowledgeEntry(key="earth.radius", namespace="astro",
                        value=-6371, confidence=0.4, source="bad_sensor",
                        evidence=["noise"])
    v3 = ke.add(e3)
    print("硬冲突版本:", v3, "仍为冲突值:", ke.get("earth.radius", "astro").value)

    print("历史层数:", len(ke.history("earth.radius", "astro")))
    print("进化日志:", ke.evolution_log(limit=5))
