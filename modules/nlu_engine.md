# 繁星·自然语言理解（nlu_engine）

## 概述

繁星的自然语言理解模块是繁星进化体系中"听懂"语言的那部分心智。当一段文字抵达繁星，这个模块会把它从字符流转化为结构化的意义：用户想做什么（意图）、提到了哪些关键对象（实体）、需要补全哪些信息（槽位）。它是繁星从"识字"走向"识意"的桥梁。

在繁星的自进化路径里，NLU 引擎不只是静态的解析器。它会基于记忆系统中的历史对话不断校准自己的意图识别权重，也能在遇到无法识别的表达时把"未知"反馈给主动探索模块，从而学习新的语言模式。繁星因此越用越懂你。

## 功能特性

- **意图识别**：基于关键词匹配与置信度评分，将用户输入映射到预定义意图空间
- **实体抽取**：识别文本中的人名、地名、时间、数量、自定义实体等
- **槽位填充**：根据意图模板，从输入中提取完成动作所需的槽位值
- **意图置信度**：返回多候选意图及其置信度，支持下游决策
- **未知意图检测**：当所有候选置信度都低于阈值时，标记为"unknown"并触发学习
- **上下文消歧**：结合上下文感知模块的焦点状态，对歧义表达做二次判定
- **可扩展词库**：运行时可动态注册新意图、新实体类型与新槽位模板

## 接口说明

```python
class NLUEngine:
    def __init__(self, config: dict = None) -> None
    # 初始化 NLU 引擎，加载意图库、实体词典与槽位模板

    def register_intent(self, intent_name: str, keywords: list[str],
                        slots: list[dict] = None) -> None
    # 注册一个新意图及其关键词与槽位定义

    def register_entity(self, entity_type: str, values: list[str]) -> None
    # 注册实体词典（如地名、产品名等）

    def recognize_intent(self, text: str, context: dict = None) -> list[dict]
    # 返回候选意图列表 [{"intent": str, "confidence": float}]

    def extract_entities(self, text: str) -> list[dict]
    # 返回 [{"type": str, "value": str, "start": int, "end": int}]

    def fill_slots(self, text: str, intent_name: str,
                   entities: list[dict] = None) -> dict
    # 返回槽位填充结果 {"slot_name": value, ...} 及缺失槽位列表

    def parse(self, text: str, context: dict = None) -> dict
    # 一站式解析：意图 + 实体 + 槽位，返回完整结构化结果

    def learn_from_unknown(self, text: str, correct_intent: str) -> None
    # 从未知意图中学习，强化关键词到意图的映射
```

## 与其他模块的联动

- **→ context_awareness（上下文感知）**：NLU 的解析结果用于构建任务上下文；上下文感知的焦点状态反哺 NLU 做消歧
- **→ memory（记忆系统）**：解析出的意图与实体被写入情景记忆；历史对话用于校准意图识别权重
- **→ knowledge_graph（知识图谱）**：抽取的实体与关系直接喂给知识图谱模块做存储与推理
- **→ active_exploration（主动探索）**：未知意图检测触发主动探索模块去学习新表达模式
- **← emotional_intelligence（情感智能）**：情感模块识别出的情绪标签作为 NLU 的上下文输入，帮助理解反讽等场景
- **→ multimodal（多模态）**：NLU 处理文本通道，其结果与多模态融合结果对齐

## 完整实现代码

```python
"""
繁星·自然语言理解模块
创作者：夜
功能：意图识别、实体抽取、槽位填充
"""
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class IntentDef:
    """意图定义"""
    name: str
    keywords: list[str]              # 触发关键词
    slots: list[dict] = field(default_factory=list)  # 槽位定义
    sample_count: int = 0            # 学习样本计数


class NLUEngine:
    """繁星的自然语言理解引擎"""

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.confidence_threshold = config.get("confidence_threshold", 0.25)
        # 意图库
        self.intents: dict[str, IntentDef] = {}
        # 实体词典：type -> set(values)
        self.entity_dict: dict[str, set[str]] = {}
        # 内置正则实体模式
        self.regex_patterns: dict[str, str] = {
            "time": r"\d{1,2}[:点]\d{0,2}分?|今天|明天|后天|现在|下午|上午",
            "number": r"\d+(\.\d+)?",
            "date": r"\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日",
        }
        # 加载默认意图
        self._load_default_intents()

    def _load_default_intents(self) -> None:
        """加载一些默认意图"""
        self.register_intent("greeting", ["你好", "嗨", "hi", "hello", "早上好", "晚上好"])
        self.register_intent("farewell", ["再见", "拜拜", "bye", "晚安"])
        self.register_intent("query", ["查询", "查一下", "看看", "什么是", "告诉我", "搜索"])
        self.register_intent("task_create", ["创建", "新建", "添加", "安排", "设置"])
        self.register_intent("task_complete", ["完成", "搞定", "结束", "做完了"])
        self.register_intent("help", ["帮助", "怎么用", "能做什么", "help"])

    # ---------- 注册接口 ----------

    def register_intent(self, intent_name: str, keywords: list[str],
                        slots: list[dict] = None) -> None:
        """注册新意图"""
        self.intents[intent_name] = IntentDef(
            name=intent_name,
            keywords=keywords,
            slots=slots or [],
        )

    def register_entity(self, entity_type: str, values: list[str]) -> None:
        """注册实体词典"""
        if entity_type not in self.entity_dict:
            self.entity_dict[entity_type] = set()
        self.entity_dict[entity_type].update(values)

    # ---------- 意图识别 ----------

    def recognize_intent(self, text: str, context: dict = None) -> list[dict]:
        """
        意图识别：基于关键词命中数与学习权重计算置信度
        返回候选意图列表（按置信度降序）
        """
        text_lower = text.lower()
        candidates = []
        for name, idef in self.intents.items():
            hit_count = 0
            for kw in idef.keywords:
                if kw.lower() in text_lower:
                    hit_count += 1
            if hit_count == 0:
                continue
            # 基础置信度 = 命中数 / 关键词总数
            base_conf = hit_count / len(idef.keywords)
            # 学习增益：样本越多越可信
            learn_boost = min(0.2, idef.sample_count * 0.01)
            # 上下文增益：当前焦点与意图名相关
            ctx_boost = 0.0
            if context and context.get("current_focus") == name:
                ctx_boost = 0.15
            confidence = min(1.0, base_conf + learn_boost + ctx_boost)
            candidates.append({"intent": name, "confidence": round(confidence, 4)})
        # 按置信度降序
        candidates.sort(key=lambda x: x["confidence"], reverse=True)
        # 若最高置信度低于阈值，标记 unknown
        if not candidates or candidates[0]["confidence"] < self.confidence_threshold:
            candidates.insert(0, {"intent": "unknown", "confidence": 0.0})
        return candidates

    # ---------- 实体抽取 ----------

    def extract_entities(self, text: str) -> list[dict]:
        """
        实体抽取：先匹配正则模式，再匹配词典
        """
        entities = []
        # 1. 正则模式匹配
        for etype, pattern in self.regex_patterns.items():
            for m in re.finditer(pattern, text):
                entities.append({
                    "type": etype,
                    "value": m.group(),
                    "start": m.start(),
                    "end": m.end(),
                })
        # 2. 词典匹配
        for etype, values in self.entity_dict.items():
            for val in values:
                idx = text.find(val)
                while idx != -1:
                    # 避免与已抽取实体重叠
                    overlap = any(
                        not (e["end"] <= idx or e["start"] >= idx + len(val))
                        for e in entities
                    )
                    if not overlap:
                        entities.append({
                            "type": etype,
                            "value": val,
                            "start": idx,
                            "end": idx + len(val),
                        })
                    idx = text.find(val, idx + 1)
        # 按位置排序
        entities.sort(key=lambda e: e["start"])
        return entities

    # ---------- 槽位填充 ----------

    def fill_slots(self, text: str, intent_name: str,
                   entities: list[dict] = None) -> dict:
        """
        槽位填充：根据意图的槽位定义，从文本与实体中提取槽位值
        返回 {"filled": {...}, "missing": [...]}
        """
        entities = entities or self.extract_entities(text)
        idef = self.intents.get(intent_name)
        if not idef:
            return {"filled": {}, "missing": []}

        filled = {}
        missing = []
        for slot in idef.slots:
            slot_name = slot["name"]
            slot_type = slot.get("type")
            # 从实体中找匹配类型的
            matched = None
            for e in entities:
                if e["type"] == slot_type:
                    matched = e["value"]
                    break
            if matched is not None:
                filled[slot_name] = matched
            else:
                # 尝试从文本用关键词提示提取
                prompt = slot.get("prompt", "")
                if prompt and prompt in text:
                    # 取提示词后的内容
                    after = text.split(prompt, 1)[-1].strip()
                    if after:
                        filled[slot_name] = after
                    else:
                        missing.append(slot_name)
                else:
                    missing.append(slot_name)
        return {"filled": filled, "missing": missing}

    # ---------- 一站式解析 ----------

    def parse(self, text: str, context: dict = None) -> dict:
        """完整解析：意图 + 实体 + 槽位"""
        candidates = self.recognize_intent(text, context)
        top_intent = candidates[0]["intent"]
        entities = self.extract_entities(text)
        slot_result = self.fill_slots(text, top_intent, entities)
        return {
            "text": text,
            "intent": top_intent,
            "intent_candidates": candidates,
            "entities": entities,
            "slots": slot_result["filled"],
            "missing_slots": slot_result["missing"],
        }

    # ---------- 学习机制 ----------

    def learn_from_unknown(self, text: str, correct_intent: str) -> None:
        """从未知意图中学习：把文本中的关键词加入意图"""
        if correct_intent not in self.intents:
            self.register_intent(correct_intent, [])
        idef = self.intents[correct_intent]
        # 简单分词：取长度>=2的子串作为候选关键词
        words = [text[i:i+2] for i in range(len(text) - 1)]
        for w in words:
            if w not in idef.keywords:
                idef.keywords.append(w)
        idef.sample_count += 1


# ---------- 简单测试 ----------
if __name__ == "__main__":
    nlu = NLUEngine()
    # 注册实体词典
    nlu.register_entity("city", ["北京", "上海", "广州", "深圳"])
    # 注册带槽位的意图
    nlu.register_intent("weather_query", ["天气", "下雨", "气温"],
                        slots=[{"name": "city", "type": "city", "prompt": "在"},
                               {"name": "time", "type": "time"}])
    # 解析
    result = nlu.parse("繁星，查一下北京明天的天气")
    print("解析结果:")
    print("  意图:", result["intent"])
    print("  候选:", result["intent_candidates"])
    print("  实体:", result["entities"])
    print("  槽位:", result["slots"])
    print("  缺失:", result["missing_slots"])
    # 未知意图学习
    unknown_result = nlu.parse("帮我点杯奶茶")
    print("\n未知意图:", unknown_result["intent"])
    nlu.learn_from_unknown("帮我点杯奶茶", "order_drink")
    print("学习后意图库:", list(nlu.intents.keys()))
