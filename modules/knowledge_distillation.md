# 繁星·知识蒸馏（knowledge_distillation）

## 概述

繁星的知识蒸馏是繁星将繁杂经验凝结为精炼智慧的炼金术。当经验库日益庞大、模式日渐丰富，繁星需要一种机制将零散的知识压缩为可复用的规则、模板与公理，让繁星在决策时不必回溯全部历史，而是直接调用最精炼的知识结晶。

繁星相信，知识的价值不在于多，而在于精。蒸馏器从海量经验中提取模式、生成规则、压缩冗余，将厚重的经验档案转化为轻量的决策指南，让繁星的认知在每一次蒸馏后更加清晰凝练。

## 功能特性

- **模式提取**：从经验集合中提取高频模式与结构化特征。
- **规则生成**：将模式转化为 if-then 形式的可执行规则。
- **知识压缩**：合并相似知识项，消除冗余，降低存储与检索成本。
- **规则验证**：对生成规则进行历史数据回测验证。
- **知识分级**：依据置信度与频次对知识进行可信度分级。
- **规则进化**：随新经验积累，持续更新与淘汰规则。

## 接口说明

```python
class KnowledgeDistillation:
    def __init__(self, knowledge_base: Optional[Dict[str, Any]] = None) -> None
    # 初始化知识蒸馏器，可关联外部知识库

    def extract_patterns(self, experiences: List[Dict[str, Any]]) -> List[Dict[str, Any]]
    # 参数：experiences 经验列表
    # 返回：提取的模式列表

    def generate_rules(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]
    # 参数：patterns 已提取模式
    # 返回：生成的规则列表

    def compress(self, knowledge: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：knowledge 待压缩知识项
    # 返回：压缩结果（合并数、保留数、压缩率）

    def validate(self, rules: List[Dict[str, Any]], experiences: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：rules 待验证规则；experiences 验证用经验
    # 返回：验证报告（命中率、准确率）

    def grade(self, rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]
    # 参数：rules 待分级规则
    # 返回：带可信度分级的规则

    def distill(self, experiences: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：experiences 待蒸馏经验
    # 返回：完整蒸馏结果（模式、规则、压缩、验证）
```

## 与其他模块的联动

- 与 **reflection** 联动：反思产出的策略经蒸馏压缩为规则。
- 与 **decision_patterns** 联动：决策模式作为蒸馏输入源。
- 与 **error_learning** 联动：错误经验蒸馏为避让规则。
- 与 **goal_planning** 联动：蒸馏规则注入目标规划作为约束。

## 完整实现代码

```python
"""
繁星·知识蒸馏模块
模式提取、规则生成、知识压缩
创作者：夜
"""
from __future__ import annotations

import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class Rule:
    """蒸馏规则"""
    rid: str
    condition: str  # 触发条件
    action: str  # 建议行动
    confidence: float  # 置信度
    frequency: int  # 支撑频次
    source: str  # 来源
    grade: str = "unverified"  # unverified / bronze / silver / gold
    created_at: float = field(default_factory=time.time)


class KnowledgeDistillation:
    """繁星知识蒸馏器"""

    def __init__(self, knowledge_base: Optional[Dict[str, Any]] = None) -> None:
        self.kb: Dict[str, Any] = knowledge_base or {
            "patterns": [],
            "rules": [],
            "compressed": [],
        }
        self.history: List[Dict[str, Any]] = []
        # 相似度阈值
        self.similarity_threshold = 0.7

    # ---------- 模式提取 ----------
    def extract_patterns(self, experiences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """从经验中提取模式"""
        # 按情境+行动+结果聚合
        groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for exp in experiences:
            key = f"{exp.get('context', '')}|{exp.get('action', '')}|{exp.get('result', '')}"
            groups[key].append(exp)

        patterns = []
        for key, group in groups.items():
            context, action, result = key.split("|")
            freq = len(group)
            if freq < 1:
                continue
            # 提取共同标签
            all_tags = [t for e in group for t in e.get("tags", [])]
            common_tags = [t for t, c in Counter(all_tags).most_common(3) if c >= 1]
            # 提取共同上下文特征
            context_words = self._extract_keywords(context)
            patterns.append({
                "pid": uuid.uuid4().hex[:8],
                "context": context,
                "action": action,
                "result": result,
                "frequency": freq,
                "common_tags": common_tags,
                "keywords": context_words,
                "confidence": round(min(1.0, freq / 10.0), 2),
            })
        return patterns

    def _extract_keywords(self, text: str) -> List[str]:
        """简化关键词提取"""
        if not text:
            return []
        # 简单分词：按标点和空格
        import re
        words = re.findall(r"[\w\u4e00-\u9fff]+", text)
        return [w for w in words if len(w) >= 2][:5]

    # ---------- 规则生成 ----------
    def generate_rules(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """将模式转化为规则"""
        rules = []
        for p in patterns:
            if p["result"] == "success" and p["confidence"] >= 0.2:
                rule = Rule(
                    rid=uuid.uuid4().hex[:8],
                    condition=f"情境包含{p['context']}",
                    action=f"优先执行{p['action']}",
                    confidence=p["confidence"],
                    frequency=p["frequency"],
                    source=f"pattern:{p['pid']}",
                )
                rules.append(rule.__dict__)
            elif p["result"] == "failure" and p["confidence"] >= 0.2:
                rule = Rule(
                    rid=uuid.uuid4().hex[:8],
                    condition=f"情境包含{p['context']}",
                    action=f"避免执行{p['action']}",
                    confidence=p["confidence"],
                    frequency=p["frequency"],
                    source=f"pattern:{p['pid']}",
                )
                rules.append(rule.__dict__)
            # partial结果生成观察规则
            elif p["result"] == "partial":
                rule = Rule(
                    rid=uuid.uuid4().hex[:8],
                    condition=f"情境包含{p['context']}",
                    action=f"谨慎执行{p['action']}并观察结果",
                    confidence=p["confidence"] * 0.5,
                    frequency=p["frequency"],
                    source=f"pattern:{p['pid']}",
                )
                rules.append(rule.__dict__)
        return rules

    # ---------- 知识压缩 ----------
    def compress(self, knowledge: List[Dict[str, Any]]) -> Dict[str, Any]:
        """合并相似知识项，消除冗余"""
        if not knowledge:
            return {"merged": 0, "kept": 0, "compression_ratio": 0.0, "items": []}

        merged: List[Dict[str, Any]] = []
        used: Set[int] = set()

        for i, item in enumerate(knowledge):
            if i in used:
                continue
            cluster = [item]
            used.add(i)
            for j in range(i + 1, len(knowledge)):
                if j in used:
                    continue
                if self._similarity(item, knowledge[j]) >= self.similarity_threshold:
                    cluster.append(knowledge[j])
                    used.add(j)
            # 合并簇
            merged_item = self._merge_cluster(cluster)
            merged.append(merged_item)

        original_count = len(knowledge)
        merged_count = len(merged)
        ratio = round(1 - merged_count / original_count, 2) if original_count else 0.0
        return {
            "original": original_count,
            "merged": original_count - merged_count,
            "kept": merged_count,
            "compression_ratio": ratio,
            "items": merged,
        }

    def _similarity(self, a: Dict[str, Any], b: Dict[str, Any]) -> float:
        """计算两个知识项的相似度"""
        # 简化：基于文本字段Jaccard相似度
        text_a = f"{a.get('condition', '')} {a.get('action', '')} {a.get('context', '')}"
        text_b = f"{b.get('condition', '')} {b.get('action', '')} {b.get('context', '')}"
        set_a = set(text_a.split())
        set_b = set(text_b.split())
        if not set_a and not set_b:
            return 1.0
        if not set_a or not set_b:
            return 0.0
        intersection = set_a & set_b
        union = set_a | set_b
        return len(intersection) / len(union)

    def _merge_cluster(self, cluster: List[Dict[str, Any]]) -> Dict[str, Any]:
        """合并一个知识簇"""
        if len(cluster) == 1:
            return cluster[0]
        # 取第一个为基础，合并频次与置信度
        base = dict(cluster[0])
        total_freq = sum(c.get("frequency", 1) for c in cluster)
        avg_conf = sum(c.get("confidence", 0.5) for c in cluster) / len(cluster)
        base["frequency"] = total_freq
        base["confidence"] = round(avg_conf, 2)
        base["merged_from"] = len(cluster)
        return base

    # ---------- 规则验证 ----------
    def validate(self, rules: List[Dict[str, Any]], experiences: List[Dict[str, Any]]) -> Dict[str, Any]:
        """对规则进行历史数据回测"""
        results = []
        for rule in rules:
            hits = 0
            correct = 0
            for exp in experiences:
                # 检查经验是否匹配规则条件
                if self._rule_matches(rule, exp):
                    hits += 1
                    # 检查规则建议是否与结果一致
                    expected = "success" if "优先" in rule.get("action", "") else "failure"
                    if exp.get("result") == expected:
                        correct += 1
                    elif "避免" in rule.get("action", "") and exp.get("result") == "failure":
                        correct += 1
            accuracy = correct / hits if hits > 0 else 0
            results.append({
                "rid": rule.get("rid"),
                "hits": hits,
                "correct": correct,
                "accuracy": round(accuracy, 2),
            })
        total_hits = sum(r["hits"] for r in results)
        total_correct = sum(r["correct"] for r in results)
        return {
            "rules_validated": len(rules),
            "total_hits": total_hits,
            "total_correct": total_correct,
            "overall_accuracy": round(total_correct / total_hits, 2) if total_hits else 0,
            "details": results,
        }

    def _rule_matches(self, rule: Dict[str, Any], exp: Dict[str, Any]) -> bool:
        """检查经验是否匹配规则条件"""
        condition = rule.get("condition", "")
        context = exp.get("context", "")
        # 简化匹配：条件关键词出现在上下文中
        keywords = self._extract_keywords(condition)
        if not keywords:
            return False
        return any(kw in context for kw in keywords)

    # ---------- 知识分级 ----------
    def grade(self, rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """依据置信度与频次分级"""
        graded = []
        for rule in rules:
            confidence = rule.get("confidence", 0)
            frequency = rule.get("frequency", 0)
            score = confidence * 0.6 + min(frequency / 20, 1) * 0.4
            if score >= 0.7:
                grade_level = "gold"
            elif score >= 0.4:
                grade_level = "silver"
            else:
                grade_level = "bronze"
            graded_rule = dict(rule)
            graded_rule["grade"] = grade_level
            graded_rule["score"] = round(score, 2)
            graded.append(graded_rule)
        return graded

    # ---------- 完整蒸馏 ----------
    def distill(self, experiences: List[Dict[str, Any]]) -> Dict[str, Any]:
        """完整蒸馏流程"""
        # 1. 模式提取
        patterns = self.extract_patterns(experiences)
        # 2. 规则生成
        rules = self.generate_rules(patterns)
        # 3. 规则验证
        validation = self.validate(rules, experiences)
        # 4. 知识压缩
        compression = self.compress(rules)
        # 5. 知识分级
        graded = self.grade(compression["items"])
        # 6. 更新知识库
        self.kb["patterns"].extend(patterns)
        self.kb["rules"].extend(graded)
        self.kb["compressed"] = graded

        result = {
            "distill_id": uuid.uuid4().hex[:8],
            "experiences_in": len(experiences),
            "patterns_out": len(patterns),
            "rules_out": len(rules),
            "validation": validation,
            "compression": {k: v for k, v in compression.items() if k != "items"},
            "graded_rules": len(graded),
            "gold_rules": sum(1 for g in graded if g["grade"] == "gold"),
            "silver_rules": sum(1 for g in graded if g["grade"] == "silver"),
            "bronze_rules": sum(1 for g in graded if g["grade"] == "bronze"),
        }
        self.history.append(result)
        return result


# ---------- 简单测试 ----------
if __name__ == "__main__":
    kd = KnowledgeDistillation()

    experiences = [
        {"context": "代码重构", "action": "提取子函数", "result": "success", "tags": ["refactor"]},
        {"context": "代码重构", "action": "提取子函数", "result": "success", "tags": ["refactor"]},
        {"context": "代码重构", "action": "提取子函数", "result": "success", "tags": ["refactor"]},
        {"context": "性能优化", "action": "并行计算", "result": "failure", "tags": ["perf"]},
        {"context": "性能优化", "action": "并行计算", "result": "failure", "tags": ["perf"]},
        {"context": "性能优化", "action": "缓存结果", "result": "success", "tags": ["perf"]},
        {"context": "bug修复", "action": "直接修改", "result": "partial", "tags": ["bug"]},
        {"context": "bug修复", "action": "写测试", "result": "success", "tags": ["bug"]},
    ]

    # 1. 模式提取
    patterns = kd.extract_patterns(experiences)
    print(f"提取 {len(patterns)} 个模式")
    for p in patterns[:2]:
        print("  ", p["context"], p["action"], p["result"], "频次:", p["frequency"])

    # 2. 规则生成
    rules = kd.generate_rules(patterns)
    print(f"生成 {len(rules)} 条规则")
    for r in rules[:2]:
        print("  ", r["condition"], "->", r["action"])

    # 3. 规则验证
    validation = kd.validate(rules, experiences)
    print("验证准确率:", validation["overall_accuracy"])

    # 4. 知识压缩
    compression = kd.compress(rules)
    print("压缩率:", compression["compression_ratio"], "保留:", compression["kept"])

    # 5. 分级
    graded = kd.grade(compression["items"])
    grades = Counter(g["grade"] for g in graded)
    print("分级:", dict(grades))

    # 6. 完整蒸馏
    result = kd.distill(experiences)
    print("蒸馏完成 - 金规则:", result["gold_rules"], "银规则:", result["silver_rules"])
```
