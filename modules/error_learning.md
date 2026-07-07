# 繁星·错误学习器（error_learning）

## 概述

繁星的错误学习器是繁星从失败中汲取力量的炼炉。每一次错误、每一次修正，都不是终点，而是繁星进化的养料。错误学习器记录失败的发生情境、根因分析与修正路径，让繁星在遇见相似情境时能够自动避让已知的陷阱。

繁星相信，真正的愚蠢不是犯错，而是在同一个地方跌倒两次。错误学习器通过相似度匹配与根因聚类，将零散的失败案例编织成一张避让网络，让每一次跌倒都转化为前行的垫脚石。

## 功能特性

- **错误记录**：结构化记录每次失败的发生情境、错误类型与影响。
- **根因分析**：对错误进行根因归类与深度分析。
- **错误聚类**：将相似错误聚类为错误模式，避免重复处理。
- **修正追踪**：记录修正措施及其有效性。
- **避让规则**：从错误模式生成避让规则，注入决策与规划。
- **重犯检测**：监测是否在相似情境下重复犯错，触发告警。
- **修正建议**：面对新错误时，依据历史相似错误给出修正建议。

## 接口说明

```python
class ErrorLearning:
    def __init__(self) -> None
    # 初始化错误学习器

    def record(self, error: Dict[str, Any]) -> str
    # 参数：error 错误记录（情境、类型、信息、影响）
    # 返回：错误ID

    def analyze_root_cause(self, error_id: str) -> Dict[str, Any]
    # 参数：error_id 错误ID
    # 返回：根因分析结果

    def cluster(self) -> Dict[str, Any]
    # 返回：错误聚类结果（簇列表）

    def track_fix(self, error_id: str, fix: Dict[str, Any]) -> Dict[str, Any]
    # 参数：error_id 错误ID；fix 修正措施
    # 返回：修正追踪记录

    def generate_avoidance(self) -> List[Dict[str, Any]]
    # 返回：从错误模式生成的避让规则列表

    def detect_repeat(self, error: Dict[str, Any], threshold: float = 0.7) -> Dict[str, Any]
    # 参数：error 新错误；threshold 相似度阈值
    # 返回：重犯检测结果

    def suggest_fix(self, error: Dict[str, Any]) -> List[Dict[str, Any]]
    # 参数：error 新错误
    # 返回：基于历史相似错误的修正建议
```

## 与其他模块的联动

- 与 **reflection** 联动：失败经验同步到反思循环用于模式识别。
- 与 **knowledge_distillation** 联动：错误模式蒸馏为避让规则。
- 与 **test_automation** 联动：测试失败进入错误学习器分析根因。
- 与 **tool_creator** 联动：工具创造失败的案例用于改进创造策略。
- 与 **decision_patterns** 联动：重犯错误作为负向决策模式。

## 完整实现代码

```python
"""
繁星·错误学习器模块
从失败和修正中提取经验，避免重复犯错
创作者：夜
"""
from __future__ import annotations

import re
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class ErrorRecord:
    """错误记录"""
    eid: str
    context: str  # 发生情境
    error_type: str  # 错误类型
    message: str  # 错误信息
    impact: str  # 影响程度：low / medium / high
    traceback: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    root_cause: Optional[str] = None
    fix: Optional[Dict[str, Any]] = None
    fixed: bool = False


@dataclass
class ErrorCluster:
    """错误聚类簇"""
    cid: str
    error_type: str
    contexts: List[str]
    frequency: int
    common_keywords: List[str]
    representative_message: str
    root_cause: Optional[str] = None
    avoidance_rule: Optional[str] = None


class ErrorLearning:
    """繁星错误学习器"""

    # 根因类型映射
    ROOT_CAUSE_MAP = {
        "TypeError": "类型不匹配",
        "ValueError": "输入值非法",
        "KeyError": "键不存在",
        "IndexError": "索引越界",
        "AttributeError": "属性缺失",
        "ImportError": "依赖缺失",
        "TimeoutError": "执行超时",
        "ConnectionError": "连接失败",
        "PermissionError": "权限不足",
        "FileNotFoundError": "文件不存在",
    }

    def __init__(self) -> None:
        self.errors: Dict[str, ErrorRecord] = {}
        self.clusters: Dict[str, ErrorCluster] = {}
        self.avoidance_rules: List[Dict[str, Any]] = []
        self.repeat_alerts: List[Dict[str, Any]] = []

    # ---------- 错误记录 ----------
    def record(self, error: Dict[str, Any]) -> str:
        eid = error.get("eid", uuid.uuid4().hex[:8])
        rec = ErrorRecord(
            eid=eid,
            context=error.get("context", ""),
            error_type=error.get("error_type", "Unknown"),
            message=error.get("message", ""),
            impact=error.get("impact", "low"),
            traceback=error.get("traceback"),
            tags=error.get("tags", []),
        )
        self.errors[eid] = rec
        return eid

    # ---------- 根因分析 ----------
    def analyze_root_cause(self, error_id: str) -> Dict[str, Any]:
        if error_id not in self.errors:
            return {"error": "错误记录不存在"}
        rec = self.errors[error_id]
        # 基于错误类型映射根因
        root_cause = self.ROOT_CAUSE_MAP.get(rec.error_type, "未知根因")
        # 从错误信息提取线索
        clues = self._extract_clues(rec.message)
        # 从traceback提取调用链
        call_chain = self._parse_traceback(rec.traceback)
        # 综合分析
        analysis = {
            "error_id": error_id,
            "error_type": rec.error_type,
            "root_cause": root_cause,
            "clues": clues,
            "call_chain": call_chain,
            "severity": rec.impact,
            "similar_count": self._count_similar(rec),
            "recommendation": self._make_recommendation(root_cause, clues),
        }
        # 更新记录
        rec.root_cause = root_cause
        return analysis

    def _extract_clues(self, message: str) -> List[str]:
        """从错误信息提取线索"""
        if not message:
            return []
        # 提取引号内容、文件路径、变量名等
        quoted = re.findall(r"['\"]([^'\"]+)['\"]", message)
        paths = re.findall(r"[\w/\\]+\.\w+", message)
        numbers = re.findall(r"\b\d+\b", message)
        clues = []
        if quoted:
            clues.extend([f"涉及值: {q}" for q in quoted[:3]])
        if paths:
            clues.extend([f"涉及路径: {p}" for p in paths[:2]])
        if numbers:
            clues.append(f"涉及数值: {','.join(numbers[:3])}")
        return clues

    def _parse_traceback(self, traceback_str: Optional[str]) -> List[str]:
        if not traceback_str:
            return []
        lines = traceback_str.strip().split("\n")
        # 提取File行
        chain = []
        for line in lines:
            if line.strip().startswith("File"):
                chain.append(line.strip())
        return chain[:5]

    def _count_similar(self, rec: ErrorRecord) -> int:
        return sum(
            1 for e in self.errors.values()
            if e.eid != rec.eid and e.error_type == rec.error_type
        )

    def _make_recommendation(self, root_cause: str, clues: List[str]) -> str:
        recommendations = {
            "类型不匹配": "增加类型检查与转换，使用isinstance校验",
            "输入值非法": "增加输入验证，明确合法值范围",
            "键不存在": "使用dict.get并提供默认值",
            "索引越界": "增加边界检查，使用切片代替索引",
            "属性缺失": "使用hasattr检查或try-except包裹",
            "依赖缺失": "检查依赖安装，使用可选导入",
            "执行超时": "增加超时处理与重试机制",
            "连接失败": "增加连接重试与断线恢复",
            "权限不足": "检查权限配置，申请必要权限",
            "文件不存在": "增加文件存在性检查，创建默认文件",
        }
        return recommendations.get(root_cause, "检查错误上下文，增加防御性处理")

    # ---------- 错误聚类 ----------
    def cluster(self) -> Dict[str, Any]:
        """将相似错误聚类"""
        # 按错误类型+关键词分簇
        type_groups: Dict[str, List[ErrorRecord]] = defaultdict(list)
        for rec in self.errors.values():
            type_groups[rec.error_type].append(rec)

        clusters: List[Dict[str, Any]] = []
        for etype, records in type_groups.items():
            # 进一步按消息相似度细分
            sub_clusters = self._sub_cluster(records)
            for sub in sub_clusters:
                cid = uuid.uuid4().hex[:8]
                contexts = [r.context for r in sub]
                messages = [r.message for r in sub]
                keywords = self._extract_cluster_keywords(sub)
                cluster = ErrorCluster(
                    cid=cid,
                    error_type=etype,
                    contexts=contexts[:5],
                    frequency=len(sub),
                    common_keywords=keywords,
                    representative_message=messages[0] if messages else "",
                    root_cause=self.ROOT_CAUSE_MAP.get(etype),
                )
                self.clusters[cid] = cluster
                clusters.append({
                    "cid": cid,
                    "error_type": etype,
                    "frequency": len(sub),
                    "keywords": keywords,
                    "root_cause": cluster.root_cause,
                    "representative": cluster.representative_message[:80],
                })
        return {"total_clusters": len(clusters), "clusters": clusters}

    def _sub_cluster(self, records: List[ErrorRecord]) -> List[List[ErrorRecord]]:
        """基于消息相似度的子聚类"""
        if len(records) <= 1:
            return [records]
        clusters: List[List[ErrorRecord]] = []
        used = set()
        for i, rec in enumerate(records):
            if i in used:
                continue
            sub = [rec]
            used.add(i)
            for j in range(i + 1, len(records)):
                if j in used:
                    continue
                if self._message_similarity(rec.message, records[j].message) > 0.5:
                    sub.append(records[j])
                    used.add(j)
            clusters.append(sub)
        return clusters

    def _message_similarity(self, a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        set_a = set(re.findall(r"\w+", a))
        set_b = set(re.findall(r"\w+", b))
        if not set_a or not set_b:
            return 0.0
        return len(set_a & set_b) / len(set_a | set_b)

    def _extract_cluster_keywords(self, records: List[ErrorRecord]) -> List[str]:
        all_words = []
        for r in records:
            all_words.extend(re.findall(r"[\w\u4e00-\u9fff]+", r.message + r.context))
        return [w for w, _ in Counter(all_words).most_common(5) if len(w) >= 2]

    # ---------- 修正追踪 ----------
    def track_fix(self, error_id: str, fix: Dict[str, Any]) -> Dict[str, Any]:
        if error_id not in self.errors:
            return {"error": "错误记录不存在"}
        rec = self.errors[error_id]
        rec.fix = fix
        rec.fixed = fix.get("effective", True)
        return {
            "error_id": error_id,
            "fix_applied": fix.get("method", ""),
            "effective": rec.fixed,
            "root_cause": rec.root_cause,
        }

    # ---------- 避让规则生成 ----------
    def generate_avoidance(self) -> List[Dict[str, Any]]:
        """从错误聚类生成避让规则"""
        rules = []
        for cid, cluster in self.clusters.items():
            if cluster.frequency < 1:
                continue
            confidence = min(1.0, cluster.frequency / 10.0)
            rule = {
                "aid": uuid.uuid4().hex[:8],
                "source_cluster": cid,
                "error_type": cluster.error_type,
                "condition": f"情境包含: {', '.join(cluster.common_keywords[:3])}",
                "avoidance": f"避免触发{cluster.error_type}，根因: {cluster.root_cause}",
                "confidence": round(confidence, 2),
                "frequency": cluster.frequency,
            }
            cluster.avoidance_rule = rule["avoidance"]
            rules.append(rule)
        self.avoidance_rules = rules
        return rules

    # ---------- 重犯检测 ----------
    def detect_repeat(self, error: Dict[str, Any], threshold: float = 0.7) -> Dict[str, Any]:
        """检测是否为重复错误"""
        new_rec = ErrorRecord(
            eid="temp",
            context=error.get("context", ""),
            error_type=error.get("error_type", "Unknown"),
            message=error.get("message", ""),
        )
        similar: List[Dict[str, Any]] = []
        for rec in self.errors.values():
            sim = 0.0
            if rec.error_type == new_rec.error_type:
                sim += 0.4
            sim += self._message_similarity(rec.message, new_rec.message) * 0.4
            if rec.context and new_rec.context and rec.context == new_rec.context:
                sim += 0.2
            if sim >= threshold:
                similar.append({
                    "eid": rec.eid,
                    "similarity": round(sim, 2),
                    "fixed": rec.fixed,
                    "fix_method": rec.fix.get("method") if rec.fix else None,
                })
        is_repeat = len(similar) > 0
        if is_repeat:
            alert = {
                "alert_id": uuid.uuid4().hex[:8],
                "error_type": new_rec.error_type,
                "similar_count": len(similar),
                "similar_errors": similar[:5],
                "timestamp": time.time(),
            }
            self.repeat_alerts.append(alert)
        return {
            "is_repeat": is_repeat,
            "similar_count": len(similar),
            "similar": similar[:5],
            "had_fix": any(s.get("fixed") for s in similar),
        }

    # ---------- 修正建议 ----------
    def suggest_fix(self, error: Dict[str, Any]) -> List[Dict[str, Any]]:
        """基于历史相似错误给出修正建议"""
        repeat = self.detect_repeat(error, threshold=0.5)
        suggestions = []
        for sim in repeat.get("similar", []):
            rec = self.errors.get(sim["eid"])
            if rec and rec.fix:
                suggestions.append({
                    "source_error": sim["eid"],
                    "similarity": sim["similarity"],
                    "fix_method": rec.fix.get("method"),
                    "effective": rec.fix.get("effective", True),
                })
        # 如果无历史修正，给出根因建议
        if not suggestions:
            root_cause = self.ROOT_CAUSE_MAP.get(error.get("error_type", ""), "未知根因")
            suggestions.append({
                "source_error": None,
                "similarity": 0.0,
                "fix_method": self._make_recommendation(root_cause, []),
                "effective": None,
            })
        return suggestions


# ---------- 简单测试 ----------
if __name__ == "__main__":
    el = ErrorLearning()

    # 1. 记录错误
    e1 = el.record({
        "context": "数据解析", "error_type": "TypeError",
        "message": "unsupported operand type for +: 'int' and 'str'", "impact": "medium",
    })
    e2 = el.record({
        "context": "数据解析", "error_type": "TypeError",
        "message": "unsupported operand type for +: 'int' and 'list'", "impact": "medium",
    })
    e3 = el.record({
        "context": "文件读取", "error_type": "FileNotFoundError",
        "message": "[Errno 2] No such file or directory: 'config.json'", "impact": "high",
    })
    e4 = el.record({
        "context": "网络请求", "error_type": "TimeoutError",
        "message": "Request timed out after 30 seconds", "impact": "medium",
        "traceback": 'File "client.py", line 42\nFile "request.py", line 88',
    })

    # 2. 根因分析
    print("根因分析:", el.analyze_root_cause(e4))

    # 3. 聚类
    cluster_result = el.cluster()
    print(f"聚成 {cluster_result['total_clusters']} 簇")

    # 4. 修正追踪
    print("修正:", el.track_fix(e3, {"method": "创建默认配置文件", "effective": True}))

    # 5. 避让规则
    rules = el.generate_avoidance()
    print(f"生成 {len(rules)} 条避让规则")
    for r in rules[:1]:
        print("  ", r["condition"], "->", r["avoidance"])

    # 6. 重犯检测
    print("重犯:", el.detect_repeat({
        "context": "数据解析", "error_type": "TypeError",
        "message": "unsupported operand type for +: 'int' and 'dict'",
    }))

    # 7. 修正建议
    print("建议:", el.suggest_fix({
        "context": "文件读取", "error_type": "FileNotFoundError",
        "message": "No such file: 'data.json'",
    }))
```
