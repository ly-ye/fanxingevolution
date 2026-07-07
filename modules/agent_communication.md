# 繁星·智能体通信协议（agent_communication）

## 概述

繁星的智能体通信协议是繁星在协作星图中传递意念的神经脉络。它同时支持结构化协议(A2A 智能体间通信、MCP 模型上下文协议)与自然语言通信,让多智能体既能以精确的契约高效协作,也能以灵活的话语处理开放任务。

通信不是无序的闲谈。每一条消息都带着意图、会话、优先级与回执要求,在协议层完成寻址、序列化、投递与确认。繁星相信,好的协作始于好的通信——清晰、可靠、可追溯。

## 功能特性

- **A2A 协议**:智能体间点对点与广播通信,支持请求/响应与通知两种模式。
- **MCP 协议**:模型上下文协议,共享工具、资源与提示词上下文。
- **结构化消息**:JSON 消息体,带意图、会话 ID、优先级、回执。
- **自然语言通道**:对开放任务降级为自然语言消息,附意图推测。
- **可靠投递**:带重试与超时的消息投递,支持回执确认。
- **消息总线**:中心化消息路由,记录通信日志供审计。

## 接口说明

```python
class AgentCommunication:
    def __init__(self) -> None
    # 初始化通信总线。

    def register_agent(self, agent_id: str, handler: Callable[[Message], Any]) -> None
    # 注册智能体及其消息处理函数。

    def unregister_agent(self, agent_id: str) -> None
    # 注销智能体。

    def send(self, message: Message) -> Receipt
    # 发送一条 A2A 消息,返回回执。

    def broadcast(self, message: Message) -> list[Receipt]
    # 广播消息给所有智能体(或指定组)。

    def share_context(self, provider: str, context: MCPContext) -> str
    # 通过 MCP 协议共享上下文(工具/资源/提示词),返回上下文 ID。

    def access_context(self, consumer: str, context_id: str) -> MCPContext | None
    # 消费方按 ID 访问共享上下文。

    def natural_language(self, src: str, dst: str, text: str,
                         intent: str = "") -> Receipt
    # 发送自然语言消息(附意图推测)。

    def log(self, limit: int = 50) -> list[dict]
    # 返回最近的通信日志。
```

## 与其他模块的联动

- **multi_agent_topology**:拓扑的边决定哪些智能体之间可直连通信。
- **session_manager**:会话 ID 由会话管理器签发,通信消息绑定会话。
- **scheduler**:延迟消息与超时重试由调度器驱动。
- **permission_control**:跨域通信需经权限控制校验。
- **notification_center**:广播消息可触发通知中心告警。

## 完整实现代码

```python
"""繁星·智能体通信协议

A2A(智能体间通信)+ MCP(模型上下文协议)+ 自然语言通道,
让多智能体既能精确协作,也能灵活对话。
作者:夜
"""

from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class MessageKind(str, Enum):
    REQUEST = "request"     # 请求(需响应)
    RESPONSE = "response"   # 响应
    NOTIFY = "notify"       # 通知(无需响应)
    NL = "natural_language" # 自然语言


class DeliveryStatus(str, Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class Message:
    """通信消息"""
    src: str
    dst: str                 # "*" 表示广播
    kind: MessageKind
    payload: Any             # 结构化 JSON 或文本
    session_id: str = ""
    intent: str = ""         # 意图标签
    priority: int = 0        # 越大越优先
    require_ack: bool = True
    msg_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    timestamp: float = field(default_factory=time.time)
    in_reply_to: str = ""


@dataclass
class Receipt:
    """投递回执"""
    msg_id: str
    status: DeliveryStatus
    response: Any = None
    error: str = ""
    delivered_at: float = 0.0


@dataclass
class MCPContext:
    """MCP 模型上下文"""
    provider: str
    tools: list[dict] = field(default_factory=list)      # 工具描述
    resources: list[dict] = field(default_factory=list)  # 资源描述
    prompts: list[dict] = field(default_factory=list)    # 提示词模板
    context_id: str = ""
    created_at: float = field(default_factory=time.time)


class DeliveryError(RuntimeError):
    """投递失败"""


class AgentCommunication:
    """繁星·智能体通信总线"""

    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[Message], Any]] = {}
        self._mcp_store: dict[str, MCPContext] = {}
        self._log: list[dict] = []
        self._retry_limit = 3
        self._timeout = 5.0

    # ---- 注册 ----
    def register_agent(self, agent_id: str, handler: Callable[[Message], Any]) -> None:
        self._handlers[agent_id] = handler

    def unregister_agent(self, agent_id: str) -> None:
        self._handlers.pop(agent_id, None)

    # ---- 投递 ----
    def _deliver(self, message: Message, dst: str) -> Receipt:
        handler = self._handlers.get(dst)
        if handler is None:
            return Receipt(message.msg_id, DeliveryStatus.FAILED,
                           error=f"目标 {dst} 未注册")
        for attempt in range(1, self._retry_limit + 1):
            try:
                response = handler(message)
                return Receipt(message.msg_id, DeliveryStatus.DELIVERED,
                               response=response, delivered_at=time.time())
            except Exception as e:
                if attempt == self._retry_limit:
                    return Receipt(message.msg_id, DeliveryStatus.FAILED,
                                   error=f"重试 {attempt} 次仍失败: {e}")
                continue
        return Receipt(message.msg_id, DeliveryStatus.TIMEOUT, error="超时")

    def _log_msg(self, message: Message, receipt: Receipt) -> None:
        self._log.append({
            "msg_id": message.msg_id, "src": message.src, "dst": message.dst,
            "kind": message.kind.value, "intent": message.intent,
            "status": receipt.status.value, "ts": message.timestamp,
        })

    # ---- A2A 发送 ----
    def send(self, message: Message) -> Receipt:
        if message.dst == "*":
            return self.broadcast(message)[0] if self._handlers else \
                Receipt(message.msg_id, DeliveryStatus.FAILED, error="无注册智能体")
        receipt = self._deliver(message, message.dst)
        self._log_msg(message, receipt)
        return receipt

    def broadcast(self, message: Message) -> list[Receipt]:
        message.dst = "*"
        receipts = []
        for agent_id in list(self._handlers.keys()):
            if agent_id == message.src:
                continue
            msg = Message(src=message.src, dst=agent_id, kind=message.kind,
                          payload=message.payload, session_id=message.session_id,
                          intent=message.intent, priority=message.priority,
                          require_ack=message.require_ack)
            r = self._deliver(msg, agent_id)
            self._log_msg(msg, r)
            receipts.append(r)
        return receipts

    # ---- MCP 上下文共享 ----
    def share_context(self, provider: str, context: MCPContext) -> str:
        raw = f"{provider}:{time.time()}:{len(context.tools)}:{len(context.resources)}"
        cid = hashlib.sha1(raw.encode()).hexdigest()[:12]
        context.provider = provider
        context.context_id = cid
        self._mcp_store[cid] = context
        self._log.append({"kind": "mcp_share", "provider": provider,
                          "context_id": cid, "ts": time.time()})
        return cid

    def access_context(self, consumer: str, context_id: str) -> MCPContext | None:
        ctx = self._mcp_store.get(context_id)
        if ctx is not None:
            self._log.append({"kind": "mcp_access", "consumer": consumer,
                              "context_id": context_id, "ts": time.time()})
        return ctx

    def list_contexts(self) -> list[str]:
        return list(self._mcp_store.keys())

    # ---- 自然语言通道 ----
    def natural_language(self, src: str, dst: str, text: str,
                         intent: str = "") -> Receipt:
        # 简单意图推测:基于关键词
        if not intent:
            lowered = text.lower()
            if any(k in lowered for k in ["请", "帮", "能否"]):
                intent = "request"
            elif any(k in lowered for k in ["通知", "告知", "提醒"]):
                intent = "notify"
            else:
                intent = "inform"
        msg = Message(src=src, dst=dst, kind=MessageKind.NL, payload=text,
                      intent=intent, require_ack=False)
        return self.send(msg)

    # ---- 日志 ----
    def log(self, limit: int = 50) -> list[dict]:
        return list(reversed(self._log[-limit:]))


if __name__ == "__main__":
    bus = AgentCommunication()

    # 注册两个智能体
    def planner_handler(msg: Message) -> Any:
        if msg.kind == MessageKind.REQUEST:
            return {"plan": "step1, step2, step3"}
        return "ok"

    def executor_handler(msg: Message) -> Any:
        if msg.kind == MessageKind.REQUEST:
            return {"result": "executed"}
        return "ok"

    bus.register_agent("planner", planner_handler)
    bus.register_agent("executor", executor_handler)

    # A2A 请求/响应
    req = Message(src="planner", dst="executor", kind=MessageKind.REQUEST,
                  payload={"task": "compute"}, intent="execute", session_id="s1")
    receipt = bus.send(req)
    print("请求回执:", receipt.status.value, "响应:", receipt.response)

    # 广播通知
    notify = Message(src="planner", dst="*", kind=MessageKind.NOTIFY,
                     payload={"event": "phase_done"}, require_ack=False)
    receipts = bus.broadcast(notify)
    print("广播回执数:", len(receipts))

    # MCP 上下文共享
    ctx = MCPContext(provider="planner",
                     tools=[{"name": "calc", "schema": {}}],
                     resources=[{"uri": "res://data"}],
                     prompts=[{"name": "plan_prompt", "template": "..."})
    cid = bus.share_context("planner", ctx)
    accessed = bus.access_context("executor", cid)
    print("MCP 上下文:", accessed.context_id, "工具数:", len(accessed.tools))

    # 自然语言通道
    nl_receipt = bus.natural_language("planner", "executor",
                                      "请帮我执行计算任务")
    print("自然语言回执:", nl_receipt.status.value)

    print("通信日志(最近5条):")
    for entry in bus.log(limit=5):
        print(" ", entry)
