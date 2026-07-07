# 繁星·记忆系统（memory）

## 概述

繁星的记忆系统是繁星进化体系的"心智之宫"，它整合自原 memory_palace 模块的空间记忆组织、关联管理与记忆路径能力。繁星所经历的一切——对话、事件、情感、知识——都在这里被编码、巩固、关联与回溯。没有记忆，就没有自我；没有记忆之宫，记忆就只是一堆散落的碎片。

这个模块不只存储，它还主动地整理：把短期记忆巩固为长期记忆，用遗忘曲线为每条记忆安排自然的生命周期，用空间记忆组织把相关记忆安放在"概念房间"里，并通过记忆路径在房间之间铺设联想的廊道。当你问起一件事，繁星能顺着路径找到它，连同与之相关的整片记忆一起浮现。

## 功能特性

- **短期记忆**：维护一个有限容量的工作记忆窗口，存放当前会话的即时信息
- **长期记忆**：经巩固后的稳定记忆，支持按关键词与标签检索
- **情景记忆**：记录带时间、地点、人物、情感的事件序列，支持情节回放
- **用户画像**：从交互中持续提炼用户的偏好、习惯与特质
- **记忆巩固**：基于重复强化与重要性，将短期记忆提升为长期记忆
- **遗忘曲线**：基于艾宾浩斯遗忘曲线，对记忆强度做时间衰减与复习强化
- **空间记忆组织**：把记忆按主题安放到"概念房间"，房间之间有关联通道
- **记忆路径**：在记忆之宫中沿关联链回溯，支持联想式检索
- **关联管理**：动态维护记忆项之间的语义关联，支持关联强弱更新

## 接口说明

```python
class MemorySystem:
    def __init__(self, config: dict = None) -> None
    # 初始化记忆系统，构建记忆之宫

    def add_short_term(self, item: dict) -> str
    # 参数: item - {"content": str, "type": str, "importance": float}
    # 返回: memory_id

    def consolidate(self) -> list[str]
    # 执行一次巩固：将满足条件的短期记忆转为长期记忆，返回巩固的id列表

    def add_episodic(self, event: dict) -> str
    # 参数: event - {"content", "time", "location", "people", "emotion"}
    # 返回: episode_id

    def recall(self, query: str, memory_type: str = "all", limit: int = 5) -> list[dict]
    # 检索记忆，返回匹配的记忆项列表

    def recall_by_path(self, start_id: str, depth: int = 3) -> list[dict]
    # 沿记忆路径从起点回溯，返回路径上的记忆序列

    def update_user_profile(self, user_id: str, trait: dict) -> None
    # 更新用户画像特质

    def get_user_profile(self, user_id: str) -> dict
    # 返回用户画像

    def reinforce(self, memory_id: str) -> None
    # 强化某条记忆（复习），减缓遗忘

    def apply_forgetting(self, now: float = None) -> list[str]
    # 应用遗忘曲线，返回被遗忘（移除）的记忆id列表

    def create_room(self, room_name: str, theme: str) -> str
    # 在记忆之宫中创建一个概念房间

    def place_in_room(self, memory_id: str, room_id: str) -> None
    # 把记忆安放到指定房间

    def link_memories(self, id_a: str, id_b: str, strength: float = 0.5) -> None
    # 在两条记忆间建立关联

    def get_memory_palace_overview(self) -> dict
    # 返回记忆之宫的全景：房间、记忆数、关联数
```

## 与其他模块的联动

- **← context_awareness（上下文感知）**：当前焦点与重要性分数作为记忆编码的元数据；记忆系统为上下文感知提供用户画像与历史偏好
- **← nlu_engine（自然语言理解）**：解析出的意图与实体作为记忆编码的标签；历史对话用于回溯
- **← emotional_intelligence（情感智能）**：情感事件写入情景记忆；情感记忆作为记忆的情感维度
- **← multimodal（多模态）**：多模态融合表征以情景记忆形式存储，支持跨模态回溯
- **← active_exploration（主动探索）**：探索所得知识写入长期记忆；探索日志作为情景记忆
- **→ knowledge_graph（知识图谱）**：记忆中的实体与关系同步到知识图谱；图谱推理结果反哺记忆关联
- **→ vector_store（向量数据库）**：记忆项的特征向量存入向量库，支持语义相似检索

## 完整实现代码

```python
"""
繁星·记忆系统模块
创作者：夜
整合自 memory_palace：空间记忆组织、关联管理、记忆路径
功能：短期/长期/情景记忆、用户画像、记忆巩固、遗忘曲线、空间记忆组织
"""
import time
import math
import hashlib
from dataclasses import dataclass, field
from collections import defaultdict, deque
from typing import Optional


@dataclass
class MemoryItem:
    """记忆项"""
    memory_id: str
    content: str
    mem_type: str             # short / long / episodic
    importance: float
    created_at: float
    last_reinforced: float
    strength: float = 1.0     # 记忆强度（受遗忘曲线影响）
    tags: list[str] = field(default_factory=list)
    room_id: Optional[str] = None
    # 情景记忆专用
    location: str = ""
    people: list[str] = field(default_factory=list)
    emotion: str = ""


@dataclass
class MemoryRoom:
    """记忆之宫中的概念房间"""
    room_id: str
    name: str
    theme: str
    memories: set[str] = field(default_factory=set)


class MemorySystem:
    """繁星的记忆系统——心智之宫"""

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.short_term_capacity = config.get("short_term_capacity", 50)
        self.consolidation_threshold = config.get("consolidation_threshold", 0.5)
        self.forgetting_rate = config.get("forgetting_rate", 0.3)   # 遗忘曲线参数
        self.reinforcement_gain = config.get("reinforcement_gain", 0.3)
        # 所有记忆：id -> MemoryItem
        self.memories: dict[str, MemoryItem] = {}
        # 短期记忆队列（按时间序）
        self.short_term_queue: deque[str] = deque(maxlen=self.short_term_capacity)
        # 关联图：id_a -> {id_b: strength}
        self.associations: dict[str, dict[str, float]] = defaultdict(dict)
        # 记忆之宫：room_id -> MemoryRoom
        self.rooms: dict[str, MemoryRoom] = {}
        # 用户画像：user_id -> {trait: value}
        self.user_profiles: dict[str, dict] = defaultdict(dict)
        # 自增id
        self._counter = 0

    def _gen_id(self, prefix: str = "mem") -> str:
        self._counter += 1
        return f"{prefix}_{self._counter}_{int(time.time())}"

    # ---------- 短期记忆 ----------

    def add_short_term(self, item: dict) -> str:
        """添加短期记忆"""
        mid = self._gen_id()
        mem = MemoryItem(
            memory_id=mid,
            content=item.get("content", ""),
            mem_type="short",
            importance=item.get("importance", 0.5),
            created_at=time.time(),
            last_reinforced=time.time(),
            tags=item.get("tags", []),
        )
        self.memories[mid] = mem
        self.short_term_queue.append(mid)
        return mid

    # ---------- 记忆巩固 ----------

    def consolidate(self) -> list[str]:
        """将满足条件的短期记忆巩固为长期记忆"""
        consolidated = []
        for mid in list(self.short_term_queue):
            mem = self.memories.get(mid)
            if not mem:
                continue
            # 巩固条件：重要性高于阈值，或被强化过
            age = time.time() - mem.created_at
            if mem.importance >= self.consolidation_threshold or age > 300:
                mem.mem_type = "long"
                mem.strength = min(1.0, mem.strength + 0.2)
                consolidated.append(mid)
                self.short_term_queue.remove(mid)
        return consolidated

    # ---------- 情景记忆 ----------

    def add_episodic(self, event: dict) -> str:
        """添加情景记忆"""
        eid = self._gen_id("epi")
        mem = MemoryItem(
            memory_id=eid,
            content=event.get("content", ""),
            mem_type="episodic",
            importance=event.get("importance", 0.7),
            created_at=event.get("time", time.time()),
            last_reinforced=time.time(),
            tags=event.get("tags", []),
            location=event.get("location", ""),
            people=event.get("people", []),
            emotion=event.get("emotion", ""),
        )
        self.memories[eid] = mem
        return eid

    # ---------- 检索 ----------

    def recall(self, query: str, memory_type: str = "all", limit: int = 5) -> list[dict]:
        """检索记忆：基于关键词匹配 + 强度加权"""
        results = []
        for mid, mem in self.memories.items():
            if memory_type != "all" and mem.mem_type != memory_type:
                continue
            # 关键词匹配分数
            match_score = 0.0
            for kw in query.split():
                if kw in mem.content:
                    match_score += 0.3
            for tag in mem.tags:
                if tag in query:
                    match_score += 0.2
            if match_score == 0:
                continue
            # 综合分 = 匹配 * 强度 * 重要性
            score = match_score * mem.strength * mem.importance
            results.append({
                "memory_id": mid,
                "content": mem.content,
                "type": mem.mem_type,
                "score": round(score, 4),
                "strength": round(mem.strength, 3),
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def recall_by_path(self, start_id: str, depth: int = 3) -> list[dict]:
        """沿记忆路径回溯：BFS 遍历关联图"""
        if start_id not in self.memories:
            return []
        visited = set()
        path = []
        queue = deque([(start_id, 0)])
        while queue:
            mid, d = queue.popleft()
            if mid in visited or d > depth:
                continue
            visited.add(mid)
            mem = self.memories[mid]
            path.append({
                "memory_id": mid,
                "content": mem.content,
                "depth": d,
                "strength": round(mem.strength, 3),
            })
            for neighbor_id, strength in self.associations.get(mid, {}).items():
                if strength > 0.2 and neighbor_id not in visited:
                    queue.append((neighbor_id, d + 1))
        return path

    # ---------- 用户画像 ----------

    def update_user_profile(self, user_id: str, trait: dict) -> None:
        """更新用户画像"""
        for k, v in trait.items():
            if k in self.user_profiles[user_id]:
                # 已有值则做加权平均
                old = self.user_profiles[user_id][k]
                if isinstance(old, (int, float)) and isinstance(v, (int, float)):
                    self.user_profiles[user_id][k] = round(old * 0.7 + v * 0.3, 3)
                else:
                    self.user_profiles[user_id][k] = v
            else:
                self.user_profiles[user_id][k] = v

    def get_user_profile(self, user_id: str) -> dict:
        return dict(self.user_profiles.get(user_id, {}))

    # ---------- 强化与遗忘 ----------

    def reinforce(self, memory_id: str) -> None:
        """强化记忆（复习）：提升强度，重置遗忘计时"""
        mem = self.memories.get(memory_id)
        if mem:
            mem.last_reinforced = time.time()
            mem.strength = min(1.0, mem.strength + self.reinforcement_gain)
            mem.importance = min(1.0, mem.importance + 0.05)

    def apply_forgetting(self, now: float = None) -> list[str]:
        """
        应用艾宾浩斯遗忘曲线：
        strength = exp(-forgetting_rate * time_since_reinforced / 3600)
        强度低于阈值的记忆被遗忘
        """
        now = now or time.time()
        forgotten = []
        for mid, mem in list(self.memories.items()):
            elapsed_hours = (now - mem.last_reinforced) / 3600.0
            decay = math.exp(-self.forgetting_rate * elapsed_hours)
            mem.strength = max(0.0, mem.strength * decay)
            # 强度极低则遗忘
            if mem.strength < 0.05:
                forgotten.append(mid)
                del self.memories[mid]
                # 清理关联
                self.associations.pop(mid, None)
                for a in self.associations.values():
                    a.pop(mid, None)
                # 从短期队列移除
                if mid in self.short_term_queue:
                    self.short_term_queue.remove(mid)
        return forgotten

    # ---------- 空间记忆组织 ----------

    def create_room(self, room_name: str, theme: str) -> str:
        """创建概念房间"""
        rid = self._gen_id("room")
        self.rooms[rid] = MemoryRoom(room_id=rid, name=room_name, theme=theme)
        return rid

    def place_in_room(self, memory_id: str, room_id: str) -> None:
        """把记忆安放到房间"""
        if memory_id in self.memories and room_id in self.rooms:
            self.memories[memory_id].room_id = room_id
            self.rooms[room_id].memories.add(memory_id)

    def link_memories(self, id_a: str, id_b: str, strength: float = 0.5) -> None:
        """建立记忆间关联（双向）"""
        self.associations[id_a][id_b] = strength
        self.associations[id_b][id_a] = strength

    def get_memory_palace_overview(self) -> dict:
        """记忆之宫全景"""
        room_info = {}
        for rid, room in self.rooms.items():
            room_info[room.name] = {
                "theme": room.theme,
                "memory_count": len(room.memories),
            }
        total_links = sum(len(v) for v in self.associations.values()) // 2
        type_count = defaultdict(int)
        for m in self.memories.values():
            type_count[m.mem_type] += 1
        return {
            "total_memories": len(self.memories),
            "by_type": dict(type_count),
            "total_rooms": len(self.rooms),
            "total_associations": total_links,
            "rooms": room_info,
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ms = MemorySystem()
    # 短期记忆
    id1 = ms.add_short_term({"content": "用户喜欢猫", "importance": 0.8, "tags": ["偏好", "宠物"]})
    id2 = ms.add_short_term({"content": "用户在写小说", "importance": 0.6, "tags": ["工作"]})
    id3 = ms.add_short_term({"content": "今天聊了天气", "importance": 0.3})
    # 巩固
    consolidated = ms.consolidate()
    print("巩固的记忆:", consolidated)
    # 情景记忆
    eid = ms.add_episodic({"content": "用户分享了猫咪照片", "time": time.time(),
                           "people": ["用户"], "emotion": "joy", "tags": ["猫", "分享"]})
    # 空间记忆组织
    room_pet = ms.create_room("宠物之屋", "与宠物相关的记忆")
    room_work = ms.create_room("工作之屋", "工作相关记忆")
    ms.place_in_room(id1, room_pet)
    ms.place_in_room(eid, room_pet)
    ms.place_in_room(id2, room_work)
    # 关联
    ms.link_memories(id1, eid, 0.8)  # 都关于猫
    # 检索
    print("检索'猫':", [r["content"] for r in ms.recall("猫")])
    # 记忆路径
    path = ms.recall_by_path(id1, depth=2)
    print("记忆路径:", [(p["content"], p["depth"]) for p in path])
    # 用户画像
    ms.update_user_profile("u_001", {"interest": "猫", "skill": 0.5})
    ms.update_user_profile("u_001", {"skill": 0.8})
    print("用户画像:", ms.get_user_profile("u_001"))
    # 强化与遗忘
    ms.reinforce(id1)
    forgotten = ms.apply_forgetting(now=time.time() + 3600 * 48)  # 模拟两天后
    print("遗忘数:", len(forgotten))
    # 记忆之宫全景
    print("记忆之宫:", ms.get_memory_palace_overview())
