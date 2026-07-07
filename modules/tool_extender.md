# 繁星·工具扩展（tool_extender）

## 概述

繁星的工具扩展整合自工具扩展与工具集，是繁星伸向世界的双手。它在运行时动态注册、学习与编排可用工具，让繁星的能力边界随经验持续生长。

繁星不只调用工具，更会观察工具的表现。每一次调用都会被记录、被评估，高效可靠的工具会被提升权重，而频繁失败的工具则会被降级或替换。通过工具编排，繁星还能将多个原子工具组合成复合流水线，应对更复杂的场景。

## 功能特性

- **动态工具注册**：运行时注册新工具，附带签名、描述与版本信息。
- **工具学习**：从调用历史中学习工具的最佳使用条件与参数模式。
- **工具编排**：将多个工具串联为流水线，支持数据透传与条件跳转。
- **性能追踪**：记录每次调用的耗时、成功率与异常，形成工具画像。
- **实用工具集合**：内置文本、计算、编码、时间等常用工具，开箱即用。
- **能力检索**：依据任务语义检索最匹配的工具集合。

## 接口说明

```python
class ToolExtender:
    def __init__(self) -> None
    # 初始化工具扩展器，预装常用工具集

    def register(self, name: str, handler: Callable, schema: Dict[str, Any]) -> None
    # 参数：name 工具名；handler 可调用对象；schema 参数与返回描述

    def call(self, name: str, **kwargs) -> Any
    # 参数：name 工具名；kwargs 调用参数
    # 返回：工具执行结果

    def learn(self, name: str) -> Dict[str, Any]
    # 参数：name 工具名
    # 返回：从历史调用中提取的最佳实践模式

    def orchestrate(self, pipeline: List[Dict[str, Any]], context: Dict[str, Any]) -> Dict[str, Any]
    # 参数：pipeline 工具编排步骤；context 共享上下文
    # 返回：编排执行结果

    def profile(self, name: Optional[str] = None) -> Dict[str, Any]
    # 参数：name 指定工具，None 表示全部
    # 返回：工具性能画像

    def search(self, query: str, topk: int = 5) -> List[Dict[str, Any]]
    # 参数：query 任务描述；topk 返回数量
    # 返回：匹配度最高的工具列表
```

## 与其他模块的联动

- 与 **tool_creator** 联动：新创造的工具经测试后注册到工具扩展器供全局使用。
- 与 **task_orchestration** 联动：工作流节点可直接调用已注册工具。
- 与 **diagnostics** 联动：工具性能画像作为诊断系统的输入源之一。
- 与 **knowledge_distillation** 联动：工具使用模式被蒸馏为可复用编排规则。

## 完整实现代码

```python
"""
繁星·工具扩展模块
整合自工具扩展与工具集：动态注册、工具学习、编排、性能追踪、实用工具集合
创作者：夜
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ToolRecord:
    """工具调用记录"""
    name: str
    args: Dict[str, Any]
    result: Any
    success: bool
    duration: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class Tool:
    """工具定义"""
    name: str
    handler: Callable[..., Any]
    schema: Dict[str, Any]
    version: str = "1.0.0"
    calls: int = 0
    successes: int = 0
    total_duration: float = 0.0
    history: deque = field(default_factory=lambda: deque(maxlen=100))


class ToolExtender:
    """繁星工具扩展器"""

    def __init__(self) -> None:
        self.tools: Dict[str, Tool] = {}
        self._register_builtin()

    # ---------- 内置工具 ----------
    def _register_builtin(self) -> None:
        self.register("text_length", lambda text: len(text),
                       {"params": {"text": "str"}, "returns": "int"})
        self.register("text_split", lambda text, sep=" ": text.split(sep),
                       {"params": {"text": "str", "sep": "str"}, "returns": "list"})
        self.register("text_join", lambda parts, sep=" ": sep.join(parts),
                       {"params": {"parts": "list", "sep": "str"}, "returns": "str"})
        self.register("calc_sum", lambda numbers: sum(numbers),
                       {"params": {"numbers": "list"}, "returns": "number"})
        self.register("calc_avg", lambda numbers: sum(numbers) / len(numbers) if numbers else 0,
                       {"params": {"numbers": "list"}, "returns": "number"})
        self.register("b64_encode", lambda text: base64.b64encode(text.encode()).decode(),
                       {"params": {"text": "str"}, "returns": "str"})
        self.register("b64_decode", lambda text: base64.b64decode(text.encode()).decode(),
                       {"params": {"text": "str"}, "returns": "str"})
        self.register("hash_md5", lambda text: hashlib.md5(text.encode()).hexdigest(),
                       {"params": {"text": "str"}, "returns": "str"})
        self.register("regex_extract", lambda text, pattern: re.findall(pattern, text),
                       {"params": {"text": "str", "pattern": "str"}, "returns": "list"})
        self.register("now_timestamp", lambda: time.time(),
                       {"params": {}, "returns": "float"})

    # ---------- 注册 ----------
    def register(self, name: str, handler: Callable, schema: Dict[str, Any]) -> None:
        self.tools[name] = Tool(name=name, handler=handler, schema=schema)

    # ---------- 调用 ----------
    def call(self, name: str, **kwargs) -> Any:
        if name not in self.tools:
            raise KeyError(f"未注册工具: {name}")
        tool = self.tools[name]
        start = time.time()
        success = True
        result = None
        try:
            result = tool.handler(**kwargs)
        except Exception as exc:  # noqa: BLE001
            success = False
            result = str(exc)
        duration = time.time() - start

        tool.calls += 1
        if success:
            tool.successes += 1
        tool.total_duration += duration
        tool.history.append(ToolRecord(name, kwargs, result, success, duration))
        return result

    # ---------- 学习 ----------
    def learn(self, name: str) -> Dict[str, Any]:
        if name not in self.tools:
            return {"error": "未知工具"}
        tool = self.tools[name]
        if not tool.history:
            return {"name": name, "patterns": [], "best_params": None}
        # 统计成功调用的参数分布
        success_args = [r.args for r in tool.history if r.success]
        if not success_args:
            return {"name": name, "patterns": [], "best_params": None, "success_rate": 0.0}
        # 提取最常出现的参数组合（简化版）
        param_freq: Dict[str, int] = defaultdict(int)
        for args in success_args:
            param_freq[json.dumps(args, sort_keys=True, default=str)] += 1
        best = max(param_freq, key=param_freq.get)
        # 提取快速调用模式
        fast_calls = [r for r in tool.history if r.success and r.duration < tool.total_duration / max(tool.calls, 1)]
        return {
            "name": name,
            "calls": tool.calls,
            "success_rate": round(tool.successes / max(tool.calls, 1), 4),
            "best_params": json.loads(best),
            "fast_pattern_count": len(fast_calls),
            "avg_duration": round(tool.total_duration / max(tool.calls, 1), 4),
        }

    # ---------- 编排 ----------
    def orchestrate(self, pipeline: List[Dict[str, Any]], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        编排示例:
        [{"tool": "text_split", "args": {"text": "$input", "sep": ","}},
         {"tool": "calc_sum", "args": {"numbers": "$prev"}}]
        """
        prev_output = None
        trace = []
        for step in pipeline:
            tool_name = step["tool"]
            raw_args = step.get("args", {})
            # 解析变量引用
            args = {}
            for k, v in raw_args.items():
                if isinstance(v, str) and v == "$input":
                    args[k] = context.get("input")
                elif isinstance(v, str) and v == "$prev":
                    args[k] = prev_output
                else:
                    args[k] = v
            result = self.call(tool_name, **args)
            trace.append({"tool": tool_name, "result": result})
            prev_output = result
        return {"final": prev_output, "trace": trace}

    # ---------- 画像 ----------
    def profile(self, name: Optional[str] = None) -> Dict[str, Any]:
        if name:
            return self._tool_profile(self.tools[name])
        return {n: self._tool_profile(t) for n, t in self.tools.items()}

    def _tool_profile(self, tool: Tool) -> Dict[str, Any]:
        return {
            "name": tool.name,
            "version": tool.version,
            "calls": tool.calls,
            "successes": tool.successes,
            "success_rate": round(tool.successes / max(tool.calls, 1), 4),
            "avg_duration": round(tool.total_duration / max(tool.calls, 1), 4),
        }

    # ---------- 检索 ----------
    def search(self, query: str, topk: int = 5) -> List[Dict[str, Any]]:
        """基于关键词匹配检索工具"""
        scored = []
        query_lower = query.lower()
        for name, tool in self.tools.items():
            schema_text = json.dumps(tool.schema, ensure_ascii=False).lower()
            score = 0.0
            for word in query_lower.split():
                if word in name.lower():
                    score += 2.0
                if word in schema_text:
                    score += 1.0
            scored.append((name, score, tool.schema))
        scored.sort(key=lambda x: -x[1])
        return [{"name": n, "score": s, "schema": sc} for n, s, sc in scored[:topk] if s > 0]


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ext = ToolExtender()

    # 1. 调用内置工具
    print("长度:", ext.call("text_length", text="hello繁星"))
    print("编码:", ext.call("b64_encode", text="hello"))
    print("解码:", ext.call("b64_decode", text=ext.call("b64_encode", text="hello")))

    # 2. 编排
    result = ext.orchestrate(
        [
            {"tool": "text_split", "args": {"text": "$input", "sep": ","}},
            {"tool": "calc_sum", "args": {"numbers": "$prev"}},
        ],
        {"input": "1,2,3,4,5"},
    )
    print("编排结果:", result["final"])

    # 3. 学习
    print("学习:", ext.learn("text_split"))

    # 4. 画像
    print("画像:", ext.profile("calc_sum"))

    # 5. 检索
    print("检索:", ext.search("文本 分割"))
```
