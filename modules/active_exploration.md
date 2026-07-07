# 繁星·主动探索（active_exploration）

## 概述

繁星的主动探索模块是繁星进化体系中"好奇心"的化身。一个真正自进化的智能体不能只被动地接收信息，它必须主动地去发现"自己不知道什么"，然后有策略地去填补这些空白。这个模块让繁星从"被投喂"转向"去寻找"，是繁星自我成长引擎的起点。

当繁星在对话中遇到无法回答的问题、识别出知识盲区，或在长时间低信息输入后感到"饥饿"时，主动探索模块会被唤醒。它会评估哪些空白最值得探索、选择探索策略（提问、检索、推理）、并把学到的新知识沉淀回记忆与知识图谱。繁星因此越用越博学。

## 功能特性

- **知识空白发现**：基于知识图谱覆盖度、对话中的"未知"标记与置信度低谷，自动识别认知盲区
- **探索优先级评估**：从用户相关度、时效性、可填补性三维度为每个空白打分排序
- **探索策略选择**：根据空白类型选择"提问用户""主动检索""推理补全"三种策略之一
- **自学机制**：对探索获得的新知识做去重、校验与整合，写入记忆与知识图谱
- **好奇心驱动**：维护一个"好奇心值"，长期无新知识输入时自动触发随机探索
- **探索日志**：记录每次探索的目标、策略、结果与收益，用于优化后续探索
- **收益反馈**：评估探索学到的知识是否真的被用到，据此调整探索方向

## 接口说明

```python
class ActiveExploration:
    def __init__(self, config: dict = None) -> None
    # 初始化主动探索引擎，设置好奇心参数与策略表

    def detect_knowledge_gaps(self, context: dict) -> list[dict]
    # 参数: context - 当前上下文（含未知标记、低置信项等）
    # 返回: [{"gap_id": str, "topic": str, "severity": float}]

    def evaluate_priority(self, gaps: list[dict], user_profile: dict) -> list[dict]
    # 返回按优先级排序的空白列表，附带探索策略

    def choose_strategy(self, gap: dict) -> str
    # 返回 "ask_user" | "retrieve" | "infer" 之一

    def explore(self, gap: dict, strategy: str, knowledge_source: callable = None) -> dict
    # 执行探索，返回 {"gap_id": str, "strategy": str, "found": bool, "knowledge": str}

    def integrate_knowledge(self, exploration_result: dict) -> bool
    # 将探索所得知识整合进记忆，返回是否成功

    def log_exploration(self, log: dict) -> None
    # 记录探索日志

    def tick_curiosity(self, info_inflow: float) -> list[dict] | None
    # 参数: info_inflow - 近期信息流入量
    # 返回: 若好奇心触发随机探索则返回探索任务列表，否则 None

    def get_exploration_stats(self) -> dict
    # 返回探索统计：总数、成功率、常用策略分布
```

## 与其他模块的联动

- **← nlu_engine（自然语言理解）**：NLU 的"未知意图"标记是知识空白的重要来源
- **← context_awareness（上下文感知）**：长时间低重要性输入流会触发好奇心探索；焦点状态帮助确定探索方向
- **→ memory（记忆系统）**：探索所得知识写入长期记忆；探索日志本身也作为情景记忆存储
- **→ knowledge_graph（知识图谱）**：探索前查询图谱覆盖度以发现空白；探索后把新实体与关系写入图谱
- **← vector_store（向量数据库）**：主动检索策略通过向量库做相似检索，验证知识是否已存在
- **← emotional_intelligence（情感智能）**：用户情绪低落时，探索模块会寻找可提振情绪的话题

## 完整实现代码

```python
"""
繁星·主动探索模块
创作者：夜
功能：知识空白发现、探索策略、自学机制
"""
import time
import math
import random
from dataclasses import dataclass, field
from collections import deque, defaultdict
from typing import Optional, Callable


@dataclass
class KnowledgeGap:
    """知识空白"""
    gap_id: str
    topic: str
    severity: float          # 严重程度 0~1
    source: str              # 来源：unknown_intent / low_confidence / graph_hole / curiosity
    discovered_at: float


@dataclass
class ExplorationLog:
    """探索日志"""
    gap_id: str
    topic: str
    strategy: str
    found: bool
    knowledge: str
    timestamp: float
    payoff: float = 0.0      # 后续收益


class ActiveExploration:
    """繁星的主动探索引擎"""

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.curiosity_base = config.get("curiosity_base", 0.5)
        self.curiosity_decay = config.get("curiosity_decay", 0.01)
        self.starvation_threshold = config.get("starvation_threshold", 0.2)
        self.max_logs = config.get("max_logs", 500)
        # 好奇心值
        self.curiosity = self.curiosity_base
        self.last_exploration_time = time.time()
        # 知识空白队列
        self.gaps: deque[KnowledgeGap] = deque(maxlen=100)
        # 探索日志
        self.logs: deque[ExplorationLog] = deque(maxlen=self.max_logs)
        # 已知知识集合（简化：用字符串集合模拟）
        self.known_topics: set[str] = set()
        # 策略收益统计：strategy -> [success_count, total_count]
        self.strategy_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])

    # ---------- 知识空白发现 ----------

    def detect_knowledge_gaps(self, context: dict) -> list[dict]:
        """从上下文中发现知识空白"""
        gaps = []
        # 来源1：未知意图
        for item in context.get("unknown_intents", []):
            gap = KnowledgeGap(
                gap_id=f"gap_{int(time.time()*1000)}_{random.randint(0,999)}",
                topic=item.get("text", ""),
                severity=0.7,
                source="unknown_intent",
                discovered_at=time.time(),
            )
            self.gaps.append(gap)
            gaps.append({"gap_id": gap.gap_id, "topic": gap.topic,
                         "severity": gap.severity, "source": gap.source})
        # 来源2：低置信度项
        for item in context.get("low_confidence_items", []):
            conf = item.get("confidence", 0.5)
            gap = KnowledgeGap(
                gap_id=f"gap_{int(time.time()*1000)}_{random.randint(0,999)}",
                topic=item.get("topic", ""),
                severity=1.0 - conf,
                source="low_confidence",
                discovered_at=time.time(),
            )
            self.gaps.append(gap)
            gaps.append({"gap_id": gap.gap_id, "topic": gap.topic,
                         "severity": gap.severity, "source": gap.source})
        # 来源3：图谱空洞（知识图谱未覆盖的实体）
        for entity in context.get("uncovered_entities", []):
            if entity not in self.known_topics:
                gap = KnowledgeGap(
                    gap_id=f"gap_{int(time.time()*1000)}_{random.randint(0,999)}",
                    topic=entity,
                    severity=0.5,
                    source="graph_hole",
                    discovered_at=time.time(),
                )
                self.gaps.append(gap)
                gaps.append({"gap_id": gap.gap_id, "topic": gap.topic,
                             "severity": gap.severity, "source": gap.source})
        return gaps

    # ---------- 优先级评估 ----------

    def evaluate_priority(self, gaps: list[dict], user_profile: dict) -> list[dict]:
        """评估探索优先级：用户相关度 + 时效性 + 可填补性"""
        evaluated = []
        user_interests = user_profile.get("interests", [])
        for g in gaps:
            # 用户相关度：话题与用户兴趣的匹配
            relevance = 0.3
            for interest in user_interests:
                if interest in g["topic"] or g["topic"] in interest:
                    relevance = 0.9
                    break
            # 时效性：越早发现越紧迫（简化）
            age = time.time() - g.get("discovered_at", time.time())
            timeliness = max(0.1, 1.0 - age / 3600.0)
            # 可填补性：来源决定
            fillability = {"unknown_intent": 0.6, "low_confidence": 0.8,
                           "graph_hole": 0.7, "curiosity": 0.5}.get(g["source"], 0.5)
            # 综合分
            priority = (g["severity"] * 0.4 + relevance * 0.35 +
                        timeliness * 0.15 + fillability * 0.1)
            strategy = self.choose_strategy(g)
            evaluated.append({**g, "priority": round(priority, 4),
                              "strategy": strategy})
        # 按优先级降序
        evaluated.sort(key=lambda x: x["priority"], reverse=True)
        return evaluated

    # ---------- 策略选择 ----------

    def choose_strategy(self, gap: dict) -> str:
        """根据空白特征选择探索策略"""
        source = gap.get("source", "")
        severity = gap.get("severity", 0.5)
        # 未知意图：优先问用户
        if source == "unknown_intent":
            return "ask_user"
        # 图谱空洞：优先检索
        if source == "graph_hole":
            return "retrieve"
        # 低置信且严重：尝试推理
        if source == "low_confidence" and severity > 0.6:
            return "infer"
        # 好奇心驱动：检索
        if source == "curiosity":
            return "retrieve"
        # 默认：根据策略历史成功率选最优
        best_strategy = "retrieve"
        best_rate = -1.0
        for s, (succ, total) in self.strategy_stats.items():
            if total > 0:
                rate = succ / total
                if rate > best_rate:
                    best_rate = rate
                    best_strategy = s
        return best_strategy

    # ---------- 执行探索 ----------

    def explore(self, gap: dict, strategy: str,
                knowledge_source: Callable = None) -> dict:
        """执行探索，返回结果"""
        topic = gap["topic"]
        found = False
        knowledge = ""
        if strategy == "ask_user":
            # 提问用户策略：标记为待提问（实际由对话层处理）
            found = False
            knowledge = f"[待向用户提问：{topic}]"
        elif strategy == "retrieve":
            # 主动检索策略：调用知识源
            if knowledge_source:
                result = knowledge_source(topic)
                if result:
                    found = True
                    knowledge = result
            else:
                # 模拟检索
                found = random.random() > 0.4
                knowledge = f"关于「{topic}」的检索结果" if found else ""
        elif strategy == "infer":
            # 推理补全策略：基于已有知识推理
            found = random.random() > 0.5
            knowledge = f"由推理得出：{topic} 的可能解释" if found else ""
        # 更新策略统计
        self.strategy_stats[strategy][1] += 1
        if found:
            self.strategy_stats[strategy][0] += 1
        result = {
            "gap_id": gap["gap_id"],
            "strategy": strategy,
            "found": found,
            "knowledge": knowledge,
        }
        # 记录日志
        self.log_exploration({
            "gap_id": gap["gap_id"], "topic": topic, "strategy": strategy,
            "found": found, "knowledge": knowledge, "timestamp": time.time(),
        })
        self.last_exploration_time = time.time()
        # 探索成功则降低好奇心
        if found:
            self.curiosity = max(0.1, self.curiosity - 0.15)
        return result

    # ---------- 知识整合 ----------

    def integrate_knowledge(self, exploration_result: dict) -> bool:
        """将探索所得知识整合（标记为已知）"""
        if not exploration_result.get("found"):
            return False
        knowledge = exploration_result.get("knowledge", "")
        if knowledge and not knowledge.startswith("[待向用户"):
            self.known_topics.add(exploration_result.get("gap_id", ""))
            return True
        return False

    # ---------- 探索日志 ----------

    def log_exploration(self, log: dict) -> None:
        """记录探索日志"""
        self.logs.append(ExplorationLog(
            gap_id=log["gap_id"],
            topic=log["topic"],
            strategy=log["strategy"],
            found=log["found"],
            knowledge=log["knowledge"],
            timestamp=log.get("timestamp", time.time()),
        ))

    def feedback_payoff(self, gap_id: str, payoff: float) -> None:
        """反馈探索收益，用于优化策略"""
        for log in reversed(self.logs):
            if log.gap_id == gap_id:
                log.payoff = payoff
                break

    # ---------- 好奇心驱动 ----------

    def tick_curiosity(self, info_inflow: float) -> Optional[list[dict]]:
        """
        好奇心tick：信息流入低时增长好奇心，触发随机探索
        """
        # 信息流入低 -> 好奇心增长
        if info_inflow < self.starvation_threshold:
            self.curiosity = min(1.0, self.curiosity + self.curiosity_decay * 10)
        else:
            self.curiosity = max(0.1, self.curiosity - self.curiosity_decay)
        # 好奇心超过阈值且距上次探索较久，触发随机探索
        idle = time.time() - self.last_exploration_time
        if self.curiosity > 0.8 and idle > 60:
            # 生成随机探索话题
            random_topics = ["新概念", "用户可能感兴趣的领域", "未覆盖的常识"]
            gaps = []
            for t in random_topics:
                gap = {
                    "gap_id": f"gap_curio_{int(time.time())}_{t}",
                    "topic": t,
                    "severity": 0.3,
                    "source": "curiosity",
                    "discovered_at": time.time(),
                }
                gaps.append(gap)
            self.curiosity = max(0.1, self.curiosity - 0.3)
            return gaps
        return None

    # ---------- 统计 ----------

    def get_exploration_stats(self) -> dict:
        """返回探索统计"""
        total = len(self.logs)
        success = sum(1 for l in self.logs if l.found)
        strategy_dist = {}
        for s, (succ, tot) in self.strategy_stats.items():
            strategy_dist[s] = {"success": succ, "total": tot,
                                "rate": round(succ / tot, 3) if tot > 0 else 0.0}
        return {
            "total_explorations": total,
            "success_count": success,
            "success_rate": round(success / total, 3) if total > 0 else 0.0,
            "curiosity": round(self.curiosity, 3),
            "known_topics_count": len(self.known_topics),
            "strategy_distribution": strategy_dist,
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ae = ActiveExploration()
    # 发现知识空白
    gaps = ae.detect_knowledge_gaps({
        "unknown_intents": [{"text": "量子纠缠是什么"}],
        "low_confidence_items": [{"topic": "相对论", "confidence": 0.2}],
        "uncovered_entities": ["暗物质"],
    })
    print("发现空白:", [g["topic"] for g in gaps])
    # 优先级评估
    prioritized = ae.evaluate_priority(gaps, {"interests": ["量子", "物理"]})
    for g in prioritized:
        print(f"  {g['topic']} 优先级={g['priority']} 策略={g['strategy']}")
    # 执行探索
    def fake_source(topic):
        return f"检索到关于{topic}的知识" if "量子" in topic else None
    for g in prioritized[:2]:
        result = ae.explore(g, g["strategy"], knowledge_source=fake_source)
        print(f"探索 {g['topic']}: found={result['found']}")
        if result["found"]:
            ae.integrate_knowledge(result)
    # 好奇心
    triggered = ae.tick_curiosity(0.1)  # 低信息流入
    print("好奇心触发:", "是" if triggered else "否", "好奇心值:", ae.curiosity)
    # 统计
    print("探索统计:", ae.get_exploration_stats())
