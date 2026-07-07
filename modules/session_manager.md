# 繁星·会话管理（session_manager）

## 概述

繁星的会话管理是繁星为每一段对话与每一次任务保留的呼吸节律。它创建会话、恢复中断的上下文、在闲置后优雅超时,让繁星与用户的每一次相遇都有连续的记忆,而非一次次重新相识。

会话不是无状态的请求。每一条会话携带状态、历史、偏好与时间戳,繁星在会话之间保持连贯,又在会话结束后及时释放资源。状态持久化让繁星即便重启也能续上未完的对话。

## 功能特性

- **会话创建**:生成唯一会话 ID,初始化状态与上下文。
- **会话恢复**:从持久化存储恢复中断的会话状态与历史。
- **状态持久化**:会话状态可序列化存储,重启后可恢复。
- **超时管理**:闲置超过阈值自动挂起或销毁,释放资源。
- **历史管理**:会话消息历史存储与截断,防止上下文膨胀。
- **会话隔离**:不同会话间状态隔离,支持多用户并发。
- **会话事件**:创建/恢复/超时/销毁事件可订阅。

## 接口说明

```python
class SessionManager:
    def __init__(self, store_path: str, timeout: float = 1800) -> None
    # 初始化会话管理器,timeout 为闲置超时秒数。

    def create(self, user_id: str, init_state: dict | None = None) -> Session
    # 创建新会话,返回会话对象。

    def get(self, session_id: str) -> Session | None
    # 获取会话;不存在或已过期返回 None。

    def resume(self, session_id: str) -> Session | None
    # 恢复会话(从持久化加载并标记为活跃)。

    def save(self, session: Session) -> None
    # 持久化会话状态。

    def touch(self, session_id: str) -> None
    # 刷新会话最后活跃时间。

    def append_message(self, session_id: str, role: str, content: str) -> None
    # 追加一条消息到会话历史。

    def expire(self, now: float | None = None) -> int
    # 清理超时会话,返回清理数量。

    def destroy(self, session_id: str) -> None
    # 销毁会话及其持久化记录。

    def list_active(self) -> list[Session]
    # 返回当前活跃会话列表。
```

## 与其他模块的联动

- **agent_communication**:通信消息绑定会话 ID,保证对话连贯。
- **llm_integration**:会话历史作为 LLM 上下文输入,支撑多轮对话。
- **cache_manager**:会话状态缓存,减少持久化 IO。
- **scheduler**:周期性触发 `expire` 清理超时会话。
- **configuration_management**:超时阈值、历史截断长度等通过配置注入。

## 完整实现代码

```python
"""繁星·会话管理

会话创建/恢复、状态持久化、超时管理、历史管理、会话隔离。
作者:夜
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Callable


class SessionState(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"   # 挂起(可恢复)
    EXPIRED = "expired"
    DESTROYED = "destroyed"


@dataclass
class Message:
    """会话消息"""
    role: str          # user / assistant / system
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class Session:
    """会话"""
    session_id: str
    user_id: str
    state: SessionState = SessionState.ACTIVE
    context: dict = field(default_factory=dict)    # 会话状态
    history: list[Message] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    max_history: int = 50

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "state": self.state.value,
            "context": self.context,
            "history": [asdict(m) for m in self.history],
            "created_at": self.created_at,
            "last_active": self.last_active,
            "max_history": self.max_history,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Session":
        return cls(
            session_id=d["session_id"], user_id=d["user_id"],
            state=SessionState(d["state"]), context=d.get("context", {}),
            history=[Message(**m) for m in d.get("history", [])],
            created_at=d.get("created_at", time.time()),
            last_active=d.get("last_active", time.time()),
            max_history=d.get("max_history", 50),
        )


class SessionManager:
    """繁星·会话管理器"""

    def __init__(self, store_path: str, timeout: float = 1800) -> None:
        self.store_path = store_path
        self.timeout = timeout
        self._sessions: dict[str, Session] = {}
        self._listeners: list[Callable[[str, Session], None]] = []
        self._lock = threading.RLock()
        os.makedirs(store_path, exist_ok=True)

    # ---- 事件 ----
    def on_event(self, fn: Callable[[str, Session], None]) -> None:
        """订阅会话事件(event, session)"""
        self._listeners.append(fn)

    def _emit(self, event: str, session: Session) -> None:
        for fn in self._listeners:
            try:
                fn(event, session)
            except Exception:
                pass

    # ---- 持久化 ----
    def _path(self, session_id: str) -> str:
        return os.path.join(self.store_path, f"{session_id}.json")

    def _persist(self, session: Session) -> None:
        with open(self._path(session.session_id), "w", encoding="utf-8") as f:
            json.dump(session.to_dict(), f, ensure_ascii=False)

    def _load(self, session_id: str) -> Session | None:
        path = self._path(session_id)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return Session.from_dict(json.load(f))

    # ---- 创建/获取 ----
    def create(self, user_id: str, init_state: dict | None = None) -> Session:
        with self._lock:
            sid = uuid.uuid4().hex[:16]
            session = Session(session_id=sid, user_id=user_id,
                              context=dict(init_state or {}))
            self._sessions[sid] = session
            self._persist(session)
            self._emit("create", session)
            return session

    def get(self, session_id: str) -> Session | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                session = self._load(session_id)
                if session is not None:
                    self._sessions[session_id] = session
            if session is None:
                return None
            if session.state in (SessionState.DESTROYED, SessionState.EXPIRED):
                return None
            if time.time() - session.last_active > self.timeout:
                session.state = SessionState.EXPIRED
                self._emit("expire", session)
                return None
            return session

    def resume(self, session_id: str) -> Session | None:
        with self._lock:
            session = self._load(session_id)
            if session is None:
                return None
            session.state = SessionState.ACTIVE
            session.last_active = time.time()
            self._sessions[session_id] = session
            self._persist(session)
            self._emit("resume", session)
            return session

    def save(self, session: Session) -> None:
        with self._lock:
            self._sessions[session.session_id] = session
            self._persist(session)

    def touch(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.last_active = time.time()

    # ---- 历史 ----
    def append_message(self, session_id: str, role: str, content: str) -> None:
        with self._lock:
            session = self.get(session_id)
            if session is None:
                return
            session.history.append(Message(role=role, content=content))
            # 截断过长历史
            if len(session.history) > session.max_history:
                # 保留 system 前缀 + 最近 N 条
                system_msgs = [m for m in session.history if m.role == "system"]
                recent = session.history[-(session.max_history - len(system_msgs)):]
                session.history = system_msgs + recent
            session.last_active = time.time()
            self._persist(session)

    def get_history(self, session_id: str, limit: int | None = None) -> list[Message]:
        session = self.get(session_id)
        if session is None:
            return []
        if limit:
            return session.history[-limit:]
        return list(session.history)

    def update_context(self, session_id: str, key: str, value: Any) -> None:
        with self._lock:
            session = self.get(session_id)
            if session:
                session.context[key] = value
                session.last_active = time.time()
                self._persist(session)

    # ---- 超时与销毁 ----
    def expire(self, now: float | None = None) -> int:
        now = now or time.time()
        expired = 0
        with self._lock:
            for sid, session in list(self._sessions.items()):
                if session.state != SessionState.ACTIVE:
                    continue
                if now - session.last_active > self.timeout:
                    session.state = SessionState.EXPIRED
                    self._persist(session)
                    del self._sessions[sid]
                    self._emit("expire", session)
                    expired += 1
        return expired

    def destroy(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is None:
                session = self._load(session_id)
            if session is None:
                return
            session.state = SessionState.DESTROYED
            self._emit("destroy", session)
            path = self._path(session_id)
            if os.path.exists(path):
                os.remove(path)

    def list_active(self) -> list[Session]:
        with self._lock:
            return [s for s in self._sessions.values()
                    if s.state == SessionState.ACTIVE]


if __name__ == "__main__":
    sm = SessionManager(store_path="./.fanxing_sessions", timeout=2.0)

    events = []
    sm.on_event(lambda e, s: events.append((e, s.session_id)))

    # 创建会话
    s1 = sm.create("user_a", {"topic": " astronomy"})
    print("创建会话:", s1.session_id, "状态:", s1.state.value)

    # 追加消息
    sm.append_message(s1.session_id, "user", "什么是黑洞?")
    sm.append_message(s1.session_id, "assistant", "黑洞是时空中引力极强的区域...")
    sm.append_message(s1.session_id, "user", "它如何形成?")
    hist = sm.get_history(s1.session_id)
    print("历史消息数:", len(hist))
    print("最近一条:", hist[-1].role, hist[-1].content)

    # 更新上下文
    sm.update_context(s1.session_id, "turn_count", 2)
    print("上下文:", sm.get(s1.session_id).context)

    # 模拟超时
    print("---- 等待超时 ----")
    s1.last_active -= 3.0  # 模拟闲置
    expired = sm.expire()
    print("超时清理数:", expired)
    print("会话已过期, get 返回:", sm.get(s1.session_id) is None)

    # 恢复会话(从持久化)
    resumed = sm.resume(s1.session_id)
    if resumed:
        print("恢复会话状态:", resumed.state.value)
        print("恢复后历史数:", len(resumed.history))

    print("事件记录:", events)
    sm.destroy(s1.session_id)
    print("销毁后 get:", sm.get(s1.session_id) is None)
