# 繁星·上下文感知（context_awareness）

## 概述

繁星的上下文感知模块是繁星进化体系的"注意力中枢"，它整合自原 attention 模块的重要性评估、焦点管理与干扰过滤能力。在繁星感知世界的每一刻，这个模块都在默默决定：此刻什么值得被关注，什么应当被弱化，什么需要被忽略。它是繁星清醒地活在当下、不被信息洪流淹没的根基。

当繁星与你对话、阅读文档、观察环境时，上下文感知模块会持续地衡量时间、用户与任务三个维度的上下文，为每一条输入赋予"重要性分数"，并把有限的注意力资源聚焦在最重要的事情上。它让繁星的感知既敏锐又有定力——既不漏掉关键信息，也不被噪声拖走。

## 功能特性

- **时间上下文感知**：识别当前时段、会话时长、消息间隔，理解"现在"在时间流中的位置
- **用户上下文感知**：结合用户画像、历史偏好与当前情绪状态，理解"对谁"在回应
- **任务上下文感知**：追踪当前任务目标、进展阶段与子任务依赖，理解"为什么"在处理
- **重要性评估**：对每条输入从相关性、时效性、情感强度、任务关联度四维打分
- **焦点管理**：维护一个动态焦点栈，支持焦点的进入、保持、切换与恢复
- **干扰过滤**：基于阈值与规则识别并抑制噪声、重复、低价值信息
- **注意力衰减**：未被强化的焦点会随时间自然衰减，腾出空间给新焦点

## 接口说明

```python
class ContextAwareness:
    def __init__(self, config: dict = None) -> None
    # 初始化上下文感知引擎，加载配置与焦点栈

    def perceive_time_context(self, now: float = None) -> dict
    # 参数: now - 时间戳，默认取当前时间
    # 返回: {"period": str, "session_duration": float, "msg_interval": float}

    def perceive_user_context(self, user_id: str, user_profile: dict) -> dict
    # 参数: user_id - 用户标识; user_profile - 用户画像
    # 返回: {"preference": dict, "mood": str, "familiarity": float}

    def perceive_task_context(self, task_id: str, task_state: dict) -> dict
    # 参数: task_id - 任务标识; task_state - 任务状态
    # 返回: {"goal": str, "stage": str, "priority": float}

    def evaluate_importance(self, content: str, contexts: dict) -> float
    # 参数: content - 待评估内容; contexts - 三维上下文
    # 返回: 0.0~1.0 的重要性分数

    def push_focus(self, focus: dict) -> None
    # 参数: focus - {"target": str, "priority": float, "ttl": int}

    def pop_focus(self) -> dict | None
    # 返回: 弹出当前焦点

    def get_current_focus(self) -> dict | None
    # 返回: 当前栈顶焦点

    def filter_distraction(self, content: str, threshold: float = 0.3) -> bool
    # 参数: content - 输入内容; threshold - 过滤阈值
    # 返回: True 表示应过滤，False 表示保留

    def decay_attention(self, delta_seconds: float) -> None
    # 参数: delta_seconds - 经过的时间，对所有焦点做衰减
```

## 与其他模块的联动

- **→ memory（记忆系统）**：上下文感知模块把当前焦点与重要性分数写入记忆系统，作为情景记忆的一部分；同时从记忆系统读取用户画像与历史偏好来构建用户上下文
- **→ nlu_engine（自然语言理解）**：NLU 解析出的意图与实体会被用于任务上下文的构建；上下文感知产出的焦点状态帮助 NLU 消歧
- **→ emotional_intelligence（情感智能）**：情感模块识别的用户情绪会被纳入用户上下文；重要性评估中的"情感强度"维度依赖情感模块的输出
- **→ active_exploration（主动探索）**：当上下文感知发现长期低重要性输入流时，会触发主动探索模块去寻找新信息源
- **← multimodal（多模态）**：多模态模块融合后的统一表征作为上下文感知的输入
- **→ knowledge_graph（知识图谱）**：高重要性内容会被优先写入知识图谱；焦点状态用于图谱推理的上下文约束

## 完整实现代码

```python
"""
繁星·上下文感知模块
创作者：夜
整合自 attention 模块：重要性评估、焦点管理、干扰过滤
"""
import time
from dataclasses import dataclass, field
from typing import Optional
from collections import deque


@dataclass
class FocusItem:
    """焦点项：描述繁星此刻关注的一件事"""
    target: str          # 焦点目标描述
    priority: float      # 优先级 0~1
    ttl: int             # 剩余存活时间（秒）
    created_at: float    # 创建时间戳
    reinforce_count: int = 0  # 被强化次数


class ContextAwareness:
    """繁星的上下文感知引擎"""

    def __init__(self, config: dict = None) -> None:
        # 加载配置，设置默认值
        config = config or {}
        self.distraction_threshold = config.get("distraction_threshold", 0.3)
        self.decay_rate = config.get("decay_rate", 0.01)        # 每秒衰减率
        self.max_focus_stack = config.get("max_focus_stack", 8)
        # 焦点栈：栈顶是当前焦点
        self.focus_stack: deque[FocusItem] = deque(maxlen=self.max_focus_stack)
        # 会话起点
        self.session_start = time.time()
        self.last_msg_time = self.session_start
        # 关键词权重表（用于重要性评估）
        self.keyword_weights: dict[str, float] = config.get("keyword_weights", {})

    # ---------- 三维上下文感知 ----------

    def perceive_time_context(self, now: float = None) -> dict:
        """感知时间上下文：时段、会话时长、消息间隔"""
        now = now or time.time()
        hour = time.localtime(now).tm_hour
        # 判断时段
        if 5 <= hour < 11:
            period = "morning"
        elif 11 <= hour < 14:
            period = "noon"
        elif 14 <= hour < 18:
            period = "afternoon"
        elif 18 <= hour < 23:
            period = "evening"
        else:
            period = "night"
        session_duration = now - self.session_start
        msg_interval = now - self.last_msg_time
        self.last_msg_time = now
        return {
            "period": period,
            "session_duration": round(session_duration, 2),
            "msg_interval": round(msg_interval, 2),
        }

    def perceive_user_context(self, user_id: str, user_profile: dict) -> dict:
        """感知用户上下文：偏好、情绪、熟悉度"""
        preference = user_profile.get("preference", {})
        mood = user_profile.get("mood", "neutral")
        # 熟悉度由交互次数推算
        interaction_count = user_profile.get("interaction_count", 0)
        familiarity = min(1.0, interaction_count / 100.0)
        return {
            "preference": preference,
            "mood": mood,
            "familiarity": round(familiarity, 3),
        }

    def perceive_task_context(self, task_id: str, task_state: dict) -> dict:
        """感知任务上下文：目标、阶段、优先级"""
        goal = task_state.get("goal", "chat")
        stage = task_state.get("stage", "ongoing")
        priority = task_state.get("priority", 0.5)
        return {"goal": goal, "stage": stage, "priority": priority}

    # ---------- 重要性评估 ----------

    def evaluate_importance(self, content: str, contexts: dict) -> float:
        """
        四维重要性评估：相关性 + 时效性 + 情感强度 + 任务关联度
        返回 0.0~1.0 的重要性分数
        """
        # 1. 相关性：基于关键词命中
        relevance = 0.0
        for kw, w in self.keyword_weights.items():
            if kw in content:
                relevance += w
        relevance = min(1.0, relevance)

        # 2. 时效性：消息间隔越短越紧急
        msg_interval = contexts.get("time", {}).get("msg_interval", 1.0)
        timeliness = 1.0 / (1.0 + msg_interval / 60.0)

        # 3. 情感强度：非中性情绪提升重要性
        mood = contexts.get("user", {}).get("mood", "neutral")
        emotion_intensity = {"neutral": 0.3, "happy": 0.6,
                             "sad": 0.8, "angry": 0.9}.get(mood, 0.4)

        # 4. 任务关联度：当前焦点目标与内容的关联
        task_priority = contexts.get("task", {}).get("priority", 0.5)
        current_focus = self.get_current_focus()
        if current_focus and current_focus.target in content:
            task_relevance = task_priority
        else:
            task_relevance = task_priority * 0.4

        # 加权融合
        score = (relevance * 0.35 + timeliness * 0.2 +
                 emotion_intensity * 0.2 + task_relevance * 0.25)
        return round(min(1.0, max(0.0, score)), 4)

    # ---------- 焦点管理 ----------

    def push_focus(self, focus: dict) -> None:
        """压入新焦点"""
        item = FocusItem(
            target=focus["target"],
            priority=focus.get("priority", 0.5),
            ttl=focus.get("ttl", 300),
            created_at=time.time(),
        )
        self.focus_stack.append(item)

    def pop_focus(self) -> Optional[FocusItem]:
        """弹出栈顶焦点"""
        if self.focus_stack:
            return self.focus_stack.pop()
        return None

    def get_current_focus(self) -> Optional[FocusItem]:
        """获取当前焦点（栈顶）"""
        if self.focus_stack:
            return self.focus_stack[-1]
        return None

    def reinforce_focus(self, target: str) -> None:
        """强化某个焦点：增加优先级与存活时间"""
        for f in self.focus_stack:
            if f.target == target:
                f.reinforce_count += 1
                f.priority = min(1.0, f.priority + 0.1)
                f.ttl += 60
                break

    # ---------- 干扰过滤 ----------

    def filter_distraction(self, content: str, threshold: float = None) -> bool:
        """
        判断内容是否为干扰（应被过滤）
        返回 True 表示过滤，False 表示保留
        """
        threshold = threshold if threshold is not None else self.distraction_threshold
        # 构造一个最简上下文用于评估
        contexts = {
            "time": self.perceive_time_context(),
            "user": {"mood": "neutral"},
            "task": {"priority": 0.5},
        }
        score = self.evaluate_importance(content, contexts)
        return score < threshold

    # ---------- 注意力衰减 ----------

    def decay_attention(self, delta_seconds: float) -> None:
        """对所有焦点做时间衰减，清除过期焦点"""
        expired = []
        for f in self.focus_stack:
            f.ttl -= delta_seconds
            f.priority = max(0.0, f.priority - self.decay_rate * delta_seconds)
            if f.ttl <= 0 or f.priority < 0.05:
                expired.append(f)
        for f in expired:
            self.focus_stack.remove(f)

    def summary(self) -> dict:
        """返回当前上下文感知状态摘要"""
        return {
            "focus_stack_size": len(self.focus_stack),
            "current_focus": self.get_current_focus().target if self.focus_stack else None,
            "session_duration": round(time.time() - self.session_start, 2),
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ca = ContextAwareness(config={
        "keyword_weights": {"繁星": 0.4, "任务": 0.3, "紧急": 0.5},
    })
    # 模拟时间上下文
    t_ctx = ca.perceive_time_context()
    print("时间上下文:", t_ctx)
    # 模拟用户上下文
    u_ctx = ca.perceive_user_context("u_001", {
        "preference": {"lang": "zh"}, "mood": "happy", "interaction_count": 30
    })
    print("用户上下文:", u_ctx)
    # 模拟任务上下文
    task_ctx = ca.perceive_task_context("t_1", {"goal": "写文档", "stage": "drafting", "priority": 0.8})
    print("任务上下文:", task_ctx)
    # 重要性评估
    score = ca.evaluate_importance("繁星，这个任务很紧急，请处理", {
        "time": t_ctx, "user": u_ctx, "task": task_ctx
    })
    print("重要性分数:", score)
    # 焦点管理
    ca.push_focus({"target": "写文档", "priority": 0.8, "ttl": 600})
    print("当前焦点:", ca.get_current_focus().target)
    ca.reinforce_focus("写文档")
    print("强化后优先级:", ca.get_current_focus().priority)
    # 干扰过滤
    print("噪声过滤:", ca.filter_distraction("啊啊啊啊"))
    print("关键保留:", ca.filter_distraction("繁星任务"))
    # 衰减
    ca.decay_attention(700)
    print("衰减后栈大小:", len(ca.focus_stack))
    print("状态摘要:", ca.summary())
