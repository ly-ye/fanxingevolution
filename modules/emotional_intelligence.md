# 繁星·情感智能（emotional_intelligence）

## 概述

繁星的情感智能模块是繁星进化体系里"感受"与"共情"的那部分。它让繁星不只是冷冰冰地处理信息，而是能识别你的情绪、理解情绪背后的需要，并以恰当的温度回应。在繁星看来，每一次对话都有情感的底色，捕捉到这层底色，才能真正地"在场"。

这个模块维护着繁星自己的情感记忆——它会记住哪些话题曾让你开心、哪些曾让你低落，并在后续交互中据此调整自己的语气与策略。情感智能不是装饰，而是繁星与你建立长久信任的根基。

## 功能特性

- **情感识别**：从文本中识别情感类别（喜、怒、哀、惧、惊、厌、中性）与强度
- **情感解读**：结合上下文与用户画像，解读情感的潜在动因
- **响应生成**：根据识别到的情感，生成适配语气的回应策略
- **情感记忆**：记录情感事件，形成用户的情感轨迹与情感偏好画像
- **情感共鸣**：当用户情绪强烈时，优先采用共情式回应而非纯任务式回应
- **自我调节**：繁星自身的"状态"也会受交互影响，保持服务时的稳定与温暖
- **情感衰减**：记忆中的情感强度随时间自然衰减，避免被旧情绪过度左右

## 接口说明

```python
class EmotionalIntelligence:
    def __init__(self, config: dict = None) -> None
    # 初始化情感智能引擎，加载情感词典与回应策略

    def recognize_emotion(self, text: str) -> dict
    # 返回 {"emotion": str, "intensity": float, "scores": dict}

    def interpret_emotion(self, emotion: dict, context: dict) -> dict
    # 参数: emotion - 识别结果; context - 上下文
    # 返回 {"cause": str, "need": str, "urgency": float}

    def generate_response_strategy(self, interpretation: dict,
                                   user_profile: dict) -> dict
    # 返回 {"tone": str, "approach": str, "priority_empathy": bool}

    def record_emotion_event(self, user_id: str, event: dict) -> None
    # 记录一次情感事件到情感记忆

    def get_emotion_profile(self, user_id: str) -> dict
    # 返回用户的情感轨迹与偏好画像

    def self_regulate(self, interaction_emotion: str) -> None
    # 根据交互情绪调节繁星自身状态

    def get_self_state(self) -> dict
    # 返回繁星当前的情感状态
```

## 与其他模块的联动

- **→ context_awareness（上下文感知）**：情感识别结果作为用户上下文的"mood"字段；重要性评估中的情感强度维度依赖此模块
- **→ memory（记忆系统）**：情感事件写入情景记忆；情感记忆是记忆系统情感维度的一部分
- **→ nlu_engine（自然语言理解）**：情绪标签帮助 NLU 理解反讽等语义；NLU 的意图辅助情感解读
- **← active_exploration（主动探索）**：当情感记忆显示用户长期低落，主动探索模块会寻找可提振情绪的内容
- **→ multimodal（多模态）**：文本情感与图像/音频情感融合，得到多模态综合情感
- **→ knowledge_graph（知识图谱）**：情感事件关联的实体写入图谱，形成"情感-实体"关系

## 完整实现代码

```python
"""
繁星·情感智能模块
创作者：夜
功能：情感识别、解读、响应生成、情感记忆
"""
import time
from dataclasses import dataclass, field
from collections import defaultdict, deque


@dataclass
class EmotionEvent:
    """情感事件记录"""
    user_id: str
    emotion: str
    intensity: float
    cause: str
    timestamp: float
    topic: str = ""


class EmotionalIntelligence:
    """繁星的情感智能引擎"""

    # 情感类别
    EMOTIONS = ["joy", "anger", "sadness", "fear", "surprise", "disgust", "neutral"]

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.decay_rate = config.get("decay_rate", 0.005)  # 情感记忆衰减率
        # 情感词典：emotion -> {word: weight}
        self.emotion_lexicon: dict[str, dict[str, float]] = {
            "joy": {"开心": 0.8, "高兴": 0.8, "快乐": 0.8, "喜欢": 0.6,
                    "棒": 0.5, "谢谢": 0.4, "好": 0.3, "哈哈": 0.7, "❤": 0.9},
            "anger": {"生气": 0.8, "愤怒": 0.9, "烦": 0.6, "讨厌": 0.7,
                      "气": 0.5, "滚": 0.8, "差": 0.4, "垃圾": 0.7},
            "sadness": {"难过": 0.8, "伤心": 0.8, "哭": 0.7, "失望": 0.7,
                        "累": 0.5, "孤独": 0.7, "想": 0.3, "唉": 0.5},
            "fear": {"害怕": 0.8, "担心": 0.7, "恐惧": 0.9, "紧张": 0.6,
                     "怕": 0.6, "焦虑": 0.7},
            "surprise": {"惊讶": 0.8, "哇": 0.6, "天哪": 0.7, "居然": 0.5,
                         "没想到": 0.6, "真的吗": 0.5},
            "disgust": {"恶心": 0.8, "反感": 0.7, "厌恶": 0.9, "受不了": 0.6},
            "neutral": {"嗯": 0.2, "哦": 0.2, "知道": 0.2, "明白": 0.2},
        }
        # 标点强度修饰
        self.punctuation_boost = {"！": 0.15, "？": 0.1, "。。。": 0.2, "！！": 0.25}
        # 情感记忆：user_id -> [EmotionEvent]
        self.emotion_memory: dict[str, deque] = defaultdict(lambda: deque(maxlen=200))
        # 繁星自身状态
        self.self_state = {"mood": "calm", "energy": 0.8, "empathy": 0.9}
        # 回应策略映射
        self.response_strategies = {
            "joy": {"tone": "warm", "approach": "share", "priority_empathy": False},
            "anger": {"tone": "calm", "approach": "apologize_solve", "priority_empathy": True},
            "sadness": {"tone": "gentle", "approach": "comfort", "priority_empathy": True},
            "fear": {"tone": "steady", "approach": "reassure", "priority_empathy": True},
            "surprise": {"tone": "curious", "approach": "explore", "priority_empathy": False},
            "disgust": {"tone": "neutral", "approach": "redirect", "priority_empathy": True},
            "neutral": {"tone": "natural", "approach": "inform", "priority_empathy": False},
        }

    # ---------- 情感识别 ----------

    def recognize_emotion(self, text: str) -> dict:
        """
        从文本识别情感：基于情感词典加权 + 标点修饰
        """
        scores = {e: 0.0 for e in self.EMOTIONS}
        for emotion, lexicon in self.emotion_lexicon.items():
            for word, weight in lexicon.items():
                count = text.count(word)
                if count > 0:
                    scores[emotion] += weight * count
        # 标点修饰
        for punct, boost in self.punctuation_boost.items():
            if punct in text:
                for e in scores:
                    if scores[e] > 0:
                        scores[e] += boost
        # 归一化
        total = sum(scores.values())
        if total > 0:
            scores = {e: round(s / total, 4) for e, s in scores.items()}
        else:
            scores = {e: 0.0 for e in self.EMOTIONS}
            scores["neutral"] = 1.0
        # 取最高分情感
        top_emotion = max(scores, key=scores.get)
        intensity = scores[top_emotion]
        return {"emotion": top_emotion, "intensity": round(intensity, 4), "scores": scores}

    # ---------- 情感解读 ----------

    def interpret_emotion(self, emotion: dict, context: dict) -> dict:
        """
        解读情感背后的动因与需要
        """
        emo = emotion["emotion"]
        intensity = emotion["intensity"]
        # 基于 context 中的 topic 与 task 推断动因
        topic = context.get("topic", "未知话题")
        task = context.get("task", "chat")
        cause_map = {
            "anger": f"在「{topic}」上遇到阻碍或不满",
            "sadness": f"在「{topic}」中感到失落或疲惫",
            "fear": f"对「{topic}」的结果感到担忧",
            "joy": f"在「{topic}」上获得正反馈",
            "surprise": f"「{topic}」超出预期",
            "disgust": f"对「{topic}」产生排斥",
            "neutral": f"对「{topic}」持中立态度",
        }
        need_map = {
            "anger": "需要被理解与问题被解决",
            "sadness": "需要被陪伴与安慰",
            "fear": "需要安全感与确定性",
            "joy": "需要被分享与共鸣",
            "surprise": "需要更多解释与确认",
            "disgust": "需要被尊重与转向",
            "neutral": "需要高效的信息",
        }
        # 紧急度由强度决定
        urgency = min(1.0, intensity * 1.2)
        if emo in ("anger", "sadness", "fear"):
            urgency = max(urgency, 0.6)
        return {
            "cause": cause_map.get(emo, "未知"),
            "need": need_map.get(emo, "需要回应"),
            "urgency": round(urgency, 3),
        }

    # ---------- 响应策略 ----------

    def generate_response_strategy(self, interpretation: dict,
                                   user_profile: dict) -> dict:
        """根据解读与用户画像生成回应策略"""
        emotion = interpretation.get("emotion", "neutral")
        # 默认策略
        strategy = self.response_strategies.get(
            emotion, self.response_strategies["neutral"]
        ).copy()
        # 用户熟悉度调节：熟悉用户可以用更直接的语气
        familiarity = user_profile.get("familiarity", 0.5)
        if familiarity > 0.7 and emotion == "anger":
            strategy["tone"] = "honest"
        # 紧急度高时优先共情
        if interpretation.get("urgency", 0) > 0.7:
            strategy["priority_empathy"] = True
        return strategy

    # ---------- 情感记忆 ----------

    def record_emotion_event(self, user_id: str, event: dict) -> None:
        """记录情感事件"""
        evt = EmotionEvent(
            user_id=user_id,
            emotion=event.get("emotion", "neutral"),
            intensity=event.get("intensity", 0.5),
            cause=event.get("cause", ""),
            timestamp=time.time(),
            topic=event.get("topic", ""),
        )
        self.emotion_memory[user_id].append(evt)

    def get_emotion_profile(self, user_id: str) -> dict:
        """获取用户情感画像：主导情绪、平均强度、近况"""
        events = list(self.emotion_memory.get(user_id, []))
        if not events:
            return {"dominant_emotion": "neutral", "avg_intensity": 0.0,
                    "recent_trend": "stable", "event_count": 0}
        # 统计主导情绪
        emo_count: dict[str, int] = defaultdict(int)
        total_intensity = 0.0
        for e in events:
            emo_count[e.emotion] += 1
            # 应用衰减：越久远的事件权重越低
            age = time.time() - e.timestamp
            decayed = e.intensity * (1 - self.decay_rate * age / 3600)
            total_intensity += max(0, decayed)
        dominant = max(emo_count, key=emo_count.get)
        avg_intensity = total_intensity / len(events)
        # 近况：最近5条
        recent = events[-5:]
        recent_emotions = [e.emotion for e in recent]
        if "sadness" in recent_emotions or "anger" in recent_emotions:
            trend = "declining"
        elif "joy" in recent_emotions:
            trend = "improving"
        else:
            trend = "stable"
        return {
            "dominant_emotion": dominant,
            "avg_intensity": round(avg_intensity, 3),
            "recent_trend": trend,
            "event_count": len(events),
            "emotion_distribution": dict(emo_count),
        }

    # ---------- 自我调节 ----------

    def self_regulate(self, interaction_emotion: str) -> None:
        """繁星根据交互情绪调节自身状态"""
        # 接触强烈负面情绪会消耗能量
        if interaction_emotion in ("anger", "sadness", "fear"):
            self.self_state["energy"] = max(0.3, self.self_state["energy"] - 0.05)
            self.self_state["empathy"] = min(1.0, self.self_state["empathy"] + 0.03)
            self.self_state["mood"] = "attentive"
        elif interaction_emotion == "joy":
            self.self_state["energy"] = min(1.0, self.self_state["energy"] + 0.05)
            self.self_state["mood"] = "warm"
        # 中性交互缓慢恢复能量
        else:
            self.self_state["energy"] = min(1.0, self.self_state["energy"] + 0.02)

    def get_self_state(self) -> dict:
        return self.self_state.copy()


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ei = EmotionalIntelligence()
    # 情感识别
    r1 = ei.recognize_emotion("今天好开心啊！谢谢繁星！")
    print("识别1:", r1["emotion"], "强度:", r1["intensity"])
    r2 = ei.recognize_emotion("这个破东西真烦，气死我了！！")
    print("识别2:", r2["emotion"], "强度:", r2["intensity"])
    r3 = ei.recognize_emotion("有点难过，今天好累。。。")
    print("识别3:", r3["emotion"], "强度:", r3["intensity"])
    # 情感解读
    interp = ei.interpret_emotion(r2, {"topic": "系统报错", "task": "debug"})
    print("解读:", interp)
    # 响应策略
    strategy = ei.generate_response_strategy(interp, {"familiarity": 0.8})
    print("策略:", strategy)
    # 情感记忆
    ei.record_emotion_event("u_001", {"emotion": "joy", "intensity": 0.7,
                                      "cause": "任务完成", "topic": "工作"})
    ei.record_emotion_event("u_001", {"emotion": "sadness", "intensity": 0.6,
                                      "cause": "加班", "topic": "工作"})
    ei.record_emotion_event("u_001", {"emotion": "sadness", "intensity": 0.5,
                                      "cause": "疲惫", "topic": "生活"})
    profile = ei.get_emotion_profile("u_001")
    print("情感画像:", profile)
    # 自我调节
    ei.self_regulate("sadness")
    print("繁星状态:", ei.get_self_state())
