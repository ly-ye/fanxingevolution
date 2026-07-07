# 繁星·全文检索（search_engine）

## 概述

繁星的全文检索是繁星在自身记忆里寻路的星图索引。它以倒排索引为骨,以 BM25 排序为序,让繁星在海量文本中瞬间定位到最相关的片段。模糊搜索容忍拼写的不完美,搜索建议在用户尚未问完时已递上可能的方向。

检索不是简单的字符串匹配。每篇文档被分词、归一化、倒排,每个词项记录出现位置与频次;查询时以 BM25 算法综合词频、文档长度与逆文档频率,给出最贴切的排序。繁星相信,好的检索让知识真正可用——找得到,才算拥有。

## 功能特性

- **倒排索引**:文档分词后构建倒排索引,支持快速词项查找。
- **BM25 排序**:基于词频、文档长度、逆文档频率的相关性排序。
- **模糊搜索**:基于编辑距离的模糊匹配,容忍拼写错误。
- **搜索建议**:根据前缀与历史查询给出补全建议。
- **中文分词**:基础中文分词(基于词典与 N-gram)。
- **高亮**:返回结果中匹配词项高亮位置。
- **增量更新**:文档增删后增量更新索引,无需全量重建。

## 接口说明

```python
class SearchEngine:
    def __init__(self) -> None
    # 初始化搜索引擎。

    def add_document(self, doc_id: str, content: str, metadata: dict | None = None) -> None
    # 添加文档到索引。

    def remove_document(self, doc_id: str) -> bool
    # 从索引中移除文档。

    def update_document(self, doc_id: str, content: str, metadata: dict | None = None) -> None
    # 更新文档(等价于移除后重新添加)。

    def search(self, query: str, limit: int = 10) -> list[SearchResult]
    # 全文检索,返回按 BM25 排序的结果。

    def fuzzy_search(self, query: str, max_distance: int = 2,
                     limit: int = 10) -> list[SearchResult]
    # 模糊搜索,容忍编辑距离内的拼写错误。

    def suggest(self, prefix: str, limit: int = 5) -> list[str]
    # 根据前缀给出搜索建议。

    def stats(self) -> dict
    # 返回索引统计(文档数、词项数等)。
```

## 与其他模块的联动

- **knowledge_evolution**:知识库作为检索语料源,检索结果支撑 RAG。
- **llm_integration**:检索结果作为 LLM 上下文,支撑知识增强生成。
- **cache_manager**:热门查询结果缓存,避免重复检索。
- **session_manager**:用户搜索历史作为会话上下文。
- **configuration_management**:分词词典、BM25 参数通过配置注入。

## 完整实现代码

```python
"""繁星·全文检索

倒排索引 + BM25 排序 + 模糊搜索(编辑距离)+ 搜索建议(前缀树)+ 中文分词。
作者:夜
"""

from __future__ import annotations

import math
import re
from collections import defaultdict, Counter
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    """检索结果"""
    doc_id: str
    score: float
    content: str = ""
    metadata: dict = field(default_factory=dict)
    highlights: list[str] = field(default_factory=list)  # 匹配的词项


class _TrieNode:
    """前缀树节点(用于搜索建议)"""
    def __init__(self):
        self.children: dict[str, _TrieNode] = {}
        self.is_word: bool = False
        self.freq: int = 0


class SearchEngine:
    """繁星·全文检索引擎"""

    def __init__(self) -> None:
        # 倒排索引: term -> {doc_id: [positions]}
        self._index: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        # 文档存储: doc_id -> (content, metadata, term_freq)
        self._docs: dict[str, tuple[str, dict, Counter]] = {}
        # 词项文档频率: term -> df
        self._df: dict[str, int] = defaultdict(int)
        # 文档长度: doc_id -> length
        self._doc_len: dict[str, int] = {}
        # 平均文档长度
        self._avg_len: float = 0.0
        # 前缀树(用于建议)
        self._trie: _TrieNode = _TrieNode()
        # BM25 参数
        self._k1 = 1.5
        self._b = 0.75
        # 简易中文词典(演示)
        self._cn_dict = {"繁星", "进化", "智能", "知识", "搜索", "索引",
                         "自愈", "架构", "范式", "协同", "通信", "调度"}

    # ---- 分词 ----
    def _tokenize(self, text: str) -> list[str]:
        """分词:英文按空格与标点,中文按词典最大匹配 + N-gram"""
        text = text.lower()
        tokens: list[str] = []
        # 英文部分:提取单词
        en_words = re.findall(r"[a-z0-9]+", text)
        tokens.extend(en_words)
        # 中文部分:最大正向匹配
        cn_chars = re.findall(r"[\u4e00-\u9fff]+", text)
        for seg in cn_chars:
            tokens.extend(self._cn_segment(seg))
        return tokens

    def _cn_segment(self, text: str) -> list[str]:
        """简易中文分词:最大正向匹配 + 双字 N-gram 兜底"""
        tokens = []
        i = 0
        while i < len(text):
            matched = False
            # 最大匹配长度 4
            for length in range(min(4, len(text) - i), 1, -1):
                word = text[i:i + length]
                if word in self._cn_dict:
                    tokens.append(word)
                    i += length
                    matched = True
                    break
            if not matched:
                # 双字 N-gram
                if i + 2 <= len(text):
                    tokens.append(text[i:i + 2])
                i += 1 if not matched else 2
        return tokens

    # ---- 索引构建 ----
    def add_document(self, doc_id: str, content: str,
                     metadata: dict | None = None) -> None:
        # 若已存在,先移除
        if doc_id in self._docs:
            self.remove_document(doc_id)
        tokens = self._tokenize(content)
        positions: dict[str, list[int]] = defaultdict(list)
        for pos, token in enumerate(tokens):
            positions[token].append(pos)
        # 写入倒排索引
        for token, poss in positions.items():
            self._index[token][doc_id] = poss
            self._df[token] += 1
            # 加入前缀树
            self._trie_insert(token)
        # 存储文档
        self._docs[doc_id] = (content, metadata or {}, Counter(tokens))
        self._doc_len[doc_id] = len(tokens)
        self._update_avg_len()

    def remove_document(self, doc_id: str) -> bool:
        if doc_id not in self._docs:
            return False
        content, metadata, term_freq = self._docs[doc_id]
        # 从倒排索引移除
        for token in term_freq:
            if doc_id in self._index[token]:
                del self._index[token][doc_id]
                self._df[token] -= 1
                if self._df[token] <= 0:
                    del self._df[token]
                    self._trie_remove(token)
        del self._docs[doc_id]
        del self._doc_len[doc_id]
        self._update_avg_len()
        return True

    def update_document(self, doc_id: str, content: str,
                        metadata: dict | None = None) -> None:
        self.add_document(doc_id, content, metadata)

    def _update_avg_len(self) -> None:
        if self._doc_len:
            self._avg_len = sum(self._doc_len.values()) / len(self._doc_len)
        else:
            self._avg_len = 0.0

    # ---- 前缀树(建议) ----
    def _trie_insert(self, word: str) -> None:
        node = self._trie
        for ch in word:
            if ch not in node.children:
                node.children[ch] = _TrieNode()
            node = node.children[ch]
        node.is_word = True
        node.freq += 1

    def _trie_remove(self, word: str) -> None:
        # 简化:不真正删除节点,仅标记
        node = self._trie
        for ch in word:
            if ch not in node.children:
                return
            node = node.children[ch]
        node.freq = max(0, node.freq - 1)
        if node.freq == 0:
            node.is_word = False

    def _trie_search_prefix(self, prefix: str) -> list[tuple[str, int]]:
        """返回以 prefix 开头的所有词及频次"""
        node = self._trie
        for ch in prefix:
            if ch not in node.children:
                return []
            node = node.children[ch]
        results: list[tuple[str, int]] = []
        self._trie_collect(node, prefix, results)
        return results

    def _trie_collect(self, node: _TrieNode, prefix: str,
                      results: list[tuple[str, int]]) -> None:
        if node.is_word:
            results.append((prefix, node.freq))
        for ch, child in node.children.items():
            self._trie_collect(child, prefix + ch, results)

    # ---- BM25 检索 ----
    def _bm25_score(self, term: str, doc_id: str) -> float:
        """计算单个词项对单个文档的 BM25 得分"""
        tf = len(self._index.get(term, {}).get(doc_id, []))
        if tf == 0:
            return 0.0
        df = self._df.get(term, 0)
        n = len(self._docs)
        # 逆文档频率
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        # 词频饱和
        doc_len = self._doc_len.get(doc_id, 0)
        norm = 1 - self._b + self._b * (doc_len / max(1, self._avg_len))
        tf_component = (tf * (self._k1 + 1)) / (tf + self._k1 * norm)
        return idf * tf_component

    def search(self, query: str, limit: int = 10) -> list[SearchResult]:
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []
        # 累积各文档得分
        scores: dict[str, float] = defaultdict(float)
        matched_terms: dict[str, set[str]] = defaultdict(set)
        for term in query_tokens:
            for doc_id in self._index.get(term, {}):
                s = self._bm25_score(term, doc_id)
                scores[doc_id] += s
                matched_terms[doc_id].add(term)
        # 排序
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
        results = []
        for doc_id, score in ranked:
            content, metadata, _ = self._docs.get(doc_id, ("", {}, Counter()))
            results.append(SearchResult(
                doc_id=doc_id, score=round(score, 4),
                content=content, metadata=metadata,
                highlights=list(matched_terms[doc_id]),
            ))
        return results

    # ---- 模糊搜索 ----
    def _edit_distance(self, s1: str, s2: str) -> int:
        """计算编辑距离"""
        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                cost = 0 if s1[i - 1] == s2[j - 1] else 1
                dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
                               dp[i - 1][j - 1] + cost)
        return dp[m][n]

    def fuzzy_search(self, query: str, max_distance: int = 2,
                     limit: int = 10) -> list[SearchResult]:
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []
        # 对每个查询词,找到编辑距离内的所有索引词项
        expanded_terms: set[str] = set()
        all_terms = list(self._index.keys())
        for qt in query_tokens:
            if qt in self._index:
                expanded_terms.add(qt)
                continue
            # 模糊匹配
            for term in all_terms:
                if abs(len(term) - len(qt)) <= max_distance:
                    if self._edit_distance(qt, term) <= max_distance:
                        expanded_terms.add(term)
        # 用扩展后的词项检索
        scores: dict[str, float] = defaultdict(float)
        matched: dict[str, set[str]] = defaultdict(set)
        for term in expanded_terms:
            for doc_id in self._index.get(term, {}):
                # 模糊匹配的词项得分降低
                s = self._bm25_score(term, doc_id) * 0.8
                scores[doc_id] += s
                matched[doc_id].add(term)
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
        results = []
        for doc_id, score in ranked:
            content, metadata, _ = self._docs.get(doc_id, ("", {}, Counter()))
            results.append(SearchResult(
                doc_id=doc_id, score=round(score, 4),
                content=content, metadata=metadata,
                highlights=list(matched[doc_id]),
            ))
        return results

    # ---- 搜索建议 ----
    def suggest(self, prefix: str, limit: int = 5) -> list[str]:
        prefix = prefix.lower()
        candidates = self._trie_search_prefix(prefix)
        # 按频次排序
        candidates.sort(key=lambda x: x[1], reverse=True)
        return [word for word, _ in candidates[:limit]]

    # ---- 统计 ----
    def stats(self) -> dict:
        return {
            "documents": len(self._docs),
            "terms": len(self._index),
            "avg_doc_len": round(self._avg_len, 2),
            "total_tokens": sum(self._doc_len.values()),
        }


if __name__ == "__main__":
    se = SearchEngine()

    # 添加文档
    docs = [
        ("d1", "繁星的自愈系统整合自自适应架构,支持故障检测与动态伸缩", {"topic": "self_healing"}),
        ("d2", "进化三定律引擎是繁星的安全门控,Endure Excel Evolve 三律守护", {"topic": "evolution_laws"}),
        ("d3", "知识进化内核负责版本管理与冲突检测,蒸馏出真正发光的知识", {"topic": "knowledge"}),
        ("d4", "多智能体拓扑动态生成协作网络,支持角色分配与冗余保障", {"topic": "topology"}),
        ("d5", "范式演进器规划 MOP 到 MASE 的四阶段范式跃迁", {"topic": "paradigm"}),
    ]
    for did, content, meta in docs:
        se.add_document(did, content, meta)

    print("索引统计:", se.stats())

    # 精确搜索
    print("---- 搜索 '进化' ----")
    for r in se.search("进化", limit=3):
        print(f"  {r.doc_id} (score={r.score}): {r.content[:30]}... 高亮: {r.highlights}")

    print("---- 搜索 '繁星 系统' ----")
    for r in se.search("繁星 系统", limit=3):
        print(f"  {r.doc_id} (score={r.score}): {r.content[:30]}... 高亮: {r.highlights}")

    # 模糊搜索(故意拼错)
    print("---- 模糊搜索 '进话'(应为'进化') ----")
    for r in se.fuzzy_search("进话", max_distance=2, limit=3):
        print(f"  {r.doc_id} (score={r.score}): 高亮 {r.highlights}")

    # 搜索建议
    print("---- 建议 '进' ----")
    print(" ", se.suggest("进"))
    print("---- 建议 '自' ----")
    print(" ", se.suggest("自"))

    # 增量更新
    se.update_document("d1", "繁星的自愈系统已升级,新增瓶颈识别功能")
    print("更新后搜索 '瓶颈':", [r.doc_id for r in se.search("瓶颈")])
    print("更新后搜索 '故障'(已移除):", [r.doc_id for r in se.search("故障")])
    print("更新后统计:", se.stats())

    # 移除文档
    se.remove_document("d5")
    print("移除 d5 后搜索 '范式':", [r.doc_id for r in se.search("范式")])
