# 繁星·缓存管理（cache_manager）

## 概述

繁星的缓存管理是繁星在时间洪流里截留浪花的堤坝。它把昂贵计算的结果与高频访问的数据暂存在离计算最近的地方,让繁星不必为同一道题反复演算。LRU 与 LFU 双策略各司其职,标签失效让一组相关缓存一同褪去,缓存穿透保护则挡住那些永远命不中的空击。

缓存不是无脑堆积。每条缓存都带着过期时间、命中计数与标签,繁星会在水位上涨时按策略优雅淘汰,在源数据变更时按标签精准失效。好的缓存让繁星更轻盈,而非更臃肿。

## 功能特性

- **LRU 缓存**:按最近最少使用淘汰,适合时序局部性强的场景。
- **LFU 缓存**:按访问频次淘汰,适合热点稳定的场景。
- **标签失效**:为缓存条目打标签,支持按标签批量失效。
- **TTL 过期**:每条缓存可设过期时间,到期自动剔除。
- **缓存穿透保护**:对查询不到的键缓存空对象并短 TTL,挡住穿透式空击。
- **命中率统计**:实时统计命中率、淘汰数,供调优。
- **容量水位**:达到容量上限时按策略优雅淘汰。

## 接口说明

```python
class CacheManager:
    def __init__(self, max_size: int = 1024, strategy: str = "lru") -> None
    # 初始化缓存,max_size 为容量,strategy 为 "lru" 或 "lfu"。

    def get(self, key: str, loader: Callable[[], Any] | None = None) -> Any
    # 读取缓存;未命中时若提供 loader 则加载并回填,否则返回 MISS。

    def set(self, key: str, value: Any, ttl: float | None = None,
            tags: list[str] | None = None) -> None
    # 写入缓存,可设过期时间与标签。

    def invalidate(self, key: str) -> bool
    # 失效单条缓存。

    def invalidate_by_tag(self, tag: str) -> int
    # 按标签批量失效,返回失效条数。

    def clear(self) -> None
    # 清空全部缓存。

    def stats(self) -> dict
    # 返回命中率、淘汰数、当前条目数等统计。
```

## 与其他模块的联动

- **llm_integration**:语义缓存复用相似问答的 LLM 响应,大幅降低 token 消耗。
- **self_healing**:动态伸缩时调用 `clear` 或调整 `max_size` 释放内存。
- **scheduler**:周期性清理过期 TTL 条目由调度器触发。
- **search_engine**:检索结果缓存,避免对相同查询重复建索引扫描。
- **configuration_management**:缓存容量、策略、默认 TTL 通过配置管理注入。

## 完整实现代码

```python
"""繁星·缓存管理

LRU/LFU 双策略 + 标签失效 + TTL + 缓存穿透保护。
作者:夜
"""

from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable


_MISS = object()  # 哨兵,表示未命中


@dataclass
class _Entry:
    """缓存条目"""
    key: str
    value: Any
    tags: list[str] = field(default_factory=list)
    expire_at: float = 0.0          # 0 表示不过期
    freq: int = 1                   # 访问频次(LFU 用)
    last_access: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)


class CacheFull(RuntimeError):
    """缓存已满且无法淘汰"""


class CacheManager:
    """繁星·缓存管理器(线程安全)"""

    def __init__(self, max_size: int = 1024, strategy: str = "lru") -> None:
        if strategy not in ("lru", "lfu"):
            raise ValueError(f"未知策略: {strategy}")
        self.max_size = max_size
        self.strategy = strategy
        self._store: OrderedDict[str, _Entry] = OrderedDict()
        self._tag_index: dict[str, set[str]] = defaultdict(set)
        self._lock = threading.RLock()
        # 统计
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        # 穿透保护:空对象缓存
        self._null_ttl = 5.0
        self._null_marker = "__NULL__"

    # ---- 内部 ----
    def _is_expired(self, entry: _Entry) -> bool:
        return entry.expire_at > 0 and time.time() > entry.expire_at

    def _evict_one(self) -> None:
        """按策略淘汰一条"""
        if not self._store:
            return
        if self.strategy == "lru":
            # 弹出最久未访问(OrderedDict 首部)
            key, entry = self._store.popitem(last=False)
        else:
            # LFU:弹出频次最低,频次相同则最久未访问
            key = min(self._store.keys(),
                      key=lambda k: (self._store[k].freq, self._store[k].last_access))
            entry = self._store.pop(key)
        # 清理标签索引
        for tag in entry.tags:
            self._tag_index[tag].discard(key)
            if not self._tag_index[tag]:
                del self._tag_index[tag]
        self._evictions += 1

    def _touch(self, key: str, entry: _Entry) -> None:
        """访问时更新元数据(LRU 移到末尾)"""
        entry.freq += 1
        entry.last_access = time.time()
        if self.strategy == "lru":
            self._store.move_to_end(key)

    def _purge_expired(self) -> None:
        """清理所有过期条目"""
        expired = [k for k, e in self._store.items() if self._is_expired(e)]
        for k in expired:
            entry = self._store.pop(k)
            for tag in entry.tags:
                self._tag_index[tag].discard(k)
                if not self._tag_index[tag]:
                    del self._tag_index[tag]

    # ---- 公共接口 ----
    def get(self, key: str, loader: Callable[[], Any] | None = None) -> Any:
        with self._lock:
            self._purge_expired()
            entry = self._store.get(key)
            if entry is not None:
                self._hits += 1
                self._touch(key, entry)
                # 空对象标记:返回 None 但视为命中
                if entry.value is self._null_marker:
                    return None
                return entry.value
            # 未命中
            self._misses += 1
            if loader is None:
                return _MISS
            value = loader()
            self.set(key, value)
            return value

    def set(self, key: str, value: Any, ttl: float | None = None,
            tags: list[str] | None = None) -> None:
        with self._lock:
            # 容量管理
            while len(self._store) >= self.max_size and key not in self._store:
                self._evict_one()
            expire_at = (time.time() + ttl) if ttl is not None else 0.0
            entry = _Entry(key=key, value=value,
                           tags=list(tags or []),
                           expire_at=expire_at)
            self._store[key] = entry
            self._store.move_to_end(key)
            for tag in entry.tags:
                self._tag_index[tag].add(key)

    def set_null(self, key: str, ttl: float | None = None) -> None:
        """缓存空对象(穿透保护)"""
        self.set(key, self._null_marker, ttl=ttl or self._null_ttl)

    def invalidate(self, key: str) -> bool:
        with self._lock:
            entry = self._store.pop(key, None)
            if entry is None:
                return False
            for tag in entry.tags:
                self._tag_index[tag].discard(key)
                if not self._tag_index[tag]:
                    del self._tag_index[tag]
            return True

    def invalidate_by_tag(self, tag: str) -> int:
        with self._lock:
            keys = list(self._tag_index.get(tag, set()))
            for k in keys:
                entry = self._store.pop(k, None)
                if entry:
                    for t in entry.tags:
                        self._tag_index[t].discard(k)
            self._tag_index.pop(tag, None)
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._tag_index.clear()

    def resize(self, new_size: int) -> None:
        """调整容量,可能触发淘汰"""
        with self._lock:
            self.max_size = new_size
            while len(self._store) > self.max_size:
                self._evict_one()

    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total) if total > 0 else 0.0
            return {
                "strategy": self.strategy,
                "size": len(self._store),
                "max_size": self.max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(hit_rate, 4),
                "evictions": self._evictions,
                "tags": len(self._tag_index),
            }

    def fingerprint(self, text: str) -> str:
        """文本指纹(供语义缓存去重)"""
        norm = "".join(text.split()).lower()
        return hashlib.sha1(norm.encode()).hexdigest()[:16]


if __name__ == "__main__":
    import random

    # LRU 策略
    cache = CacheManager(max_size=3, strategy="lru")
    cache.set("a", 1, tags=["g1"])
    cache.set("b", 2, tags=["g1", "g2"])
    cache.set("c", 3, tags=["g2"])
    print("get a:", cache.get("a"))   # 命中,a 移到末尾
    cache.set("d", 4)                  # 容量满,淘汰最久未用的 b
    print("get b:", cache.get("b") is _MISS, "(应未命中)")
    print("统计:", cache.stats())

    # 标签失效
    cache.invalidate_by_tag("g2")
    print("失效 g2 后:", cache.stats())

    # LFU 策略
    lfu = CacheManager(max_size=3, strategy="lfu")
    for k in ["x", "y", "x", "z", "x", "y"]:
        lfu.get(k, loader=lambda: hash(k))
    lfu.set("w", 99)  # 应淘汰 z(频次最低)
    print("LFU get z:", lfu.get("z") is _MISS, "(应未命中)")
    print("LFU 统计:", lfu.stats())

    # 穿透保护
    pc = CacheManager(max_size=10)
    pc.get("missing", loader=lambda: None)  # loader 返回 None
    pc.set_null("always_missing", ttl=10)
    print("穿透保护命中空对象:", pc.get("always_missing") is None)
    print("穿透保护统计:", pc.stats())
