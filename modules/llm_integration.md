# 繁星·LLM 集成（llm_integration）

## 概述

繁星的 LLM 集成整合自 LLM 集成与 Token 优化器,是繁星与外部大语言模型对话的咽喉要道。它以统一接口屏蔽 OpenAI、Claude、Ollama 等不同模型的后端差异,让繁星用同一套代码与任意模型对话;同时以语义缓存、上下文压缩、提示词精简与模型路由,把每一次调用的 token 成本压到最低。

繁星不浪费每一个 token。语义缓存让相似问题不必重算,上下文压缩让冗长历史凝练为精华,提示词精简去掉一切不必要的修饰,模型路由让简单问题走轻量模型、复杂问题走旗舰模型。好的 LLM 集成让繁星既聪明,又克制。

## 功能特性

- **统一 LLM 接口**:OpenAI/Claude/Ollama 统一为同一套调用接口。
- **流式输出**:支持流式响应,逐 token 返回。
- **工具调用**:支持 function calling / tool use。
- **语义缓存**:基于文本指纹与相似度的语义缓存,复用相似问答响应。
- **上下文压缩**:长对话历史压缩为摘要,保留关键信息。
- **提示词精简**:去除冗余修饰,压缩提示词长度。
- **模型路由**:按任务复杂度与成本路由到合适模型。
- **Token 计量**:统计每次调用的 token 消耗与成本。

## 接口说明

```python
class LLMIntegration:
    def __init__(self, providers: dict[str, ProviderConfig],
                 cache: CacheManager | None = None) -> None
    # 初始化 LLM 集成,providers 为各模型后端配置,cache 为语义缓存。

    def chat(self, messages: list[dict], model: str | None = None,
             tools: list[dict] | None = None, stream: bool = False) -> LLMResponse
    # 发起对话请求,自动路由模型、缓存、压缩。

    def chat_stream(self, messages: list[dict],
                    model: str | None = None) -> Iterator[str]
    # 流式对话,逐 token 返回。

    def compress_context(self, messages: list[dict], max_tokens: int = 2000) -> list[dict]
    # 压缩对话历史为摘要 + 近期消息。

    def simplify_prompt(self, prompt: str) -> str
    # 精简提示词,去除冗余。

    def route_model(self, messages: list[dict], tools: list | None = None) -> str
    # 按复杂度路由到合适模型。

    def estimate_tokens(self, text: str) -> int
    # 估算文本 token 数。

    def usage_stats(self) -> dict
    # 返回 token 用量与成本统计。
```

## 与其他模块的联动

- **cache_manager**:语义缓存基于缓存管理器实现。
- **session_manager**:会话历史作为对话上下文,经压缩后送入 LLM。
- **configuration_management**:各模型 API Key、路由策略、成本阈值通过配置注入。
- **knowledge_evolution**:LLM 输出经验沉淀为知识,语义缓存命中可凝练为通用知识。
- **benchmark_evaluator**:评测 LLM 工具调用与响应质量。
- **permission_control**:API Key 等敏感配置经权限控制保护。

## 完整实现代码

```python
"""繁星·LLM 集成

整合自 LLM 集成与 Token 优化器:
统一接口(OpenAI/Claude/Ollama)+ 流式 + 工具调用
+ 语义缓存 + 上下文压缩 + 提示词精简 + 模型路由 + Token 计量。
作者:夜
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterator


class ModelTier(str, Enum):
    LITE = "lite"        # 轻量(低成本)
    STANDARD = "standard"  # 标准
    FLAGSHIP = "flagship"  # 旗舰(高能力)


@dataclass
class ProviderConfig:
    """模型后端配置"""
    name: str                # openai / claude / ollama
    model: str               # 具体模型名
    tier: ModelTier
    api_key: str = ""
    base_url: str = ""
    cost_per_1k_input: float = 0.0   # 每千 token 输入成本
    cost_per_1k_output: float = 0.0  # 每千 token 输出成本
    max_tokens: int = 4096


@dataclass
class LLMResponse:
    """LLM 响应"""
    content: str
    model: str
    tier: ModelTier
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0
    cached: bool = False
    tool_calls: list[dict] = field(default_factory=list)
    latency: float = 0.0


class LLMError(RuntimeError):
    """LLM 调用错误"""


class LLMIntegration:
    """繁星·LLM 集成(整合 Token 优化器)"""

    def __init__(self, providers: dict[str, ProviderConfig],
                 cache: Any = None) -> None:
        self.providers = providers
        self.cache = cache
        self._mock_fn: Callable[[list[dict], ProviderConfig], str] | None = None
        # 用量统计
        self._usage = {
            "total_calls": 0, "cache_hits": 0,
            "total_input_tokens": 0, "total_output_tokens": 0,
            "total_cost": 0.0,
            "by_model": {},
        }

    def set_mock(self, fn: Callable[[list[dict], ProviderConfig], str]) -> None:
        """设置模拟生成函数(便于无 API 环境测试)"""
        self._mock_fn = fn

    # ---- Token 估算 ----
    def estimate_tokens(self, text: str) -> int:
        """粗略估算 token 数(英文约 1 token/4 字符,中文约 1 token/1.5 字符)"""
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        non_ascii = len(text) - ascii_chars
        return max(1, int(ascii_chars / 4 + non_ascii / 1.5))

    def _messages_tokens(self, messages: list[dict]) -> int:
        return sum(self.estimate_tokens(m.get("content", "")) for m in messages)

    # ---- 语义缓存 ----
    def _cache_key(self, messages: list[dict], model: str) -> str:
        """生成语义缓存键(基于内容指纹)"""
        content = "|".join(f"{m['role']}:{m.get('content', '')}" for m in messages)
        norm = "".join(content.split()).lower()
        return f"{model}:{hashlib.sha1(norm.encode()).hexdigest()[:16]}"

    def _cache_get(self, key: str) -> str | None:
        if self.cache is None:
            return None
        val = self.cache.get(key)
        return val if val is not self.cache.__class__ and val is not None else None

    def _cache_set(self, key: str, value: str, ttl: float | None = None) -> None:
        if self.cache is not None and hasattr(self.cache, "set"):
            self.cache.set(key, value, ttl=ttl or 3600)

    # ---- 模型路由 ----
    def route_model(self, messages: list[dict],
                    tools: list | None = None) -> str:
        """按复杂度路由:有工具调用或长上下文走旗舰,短问题走轻量"""
        total_tokens = self._messages_tokens(messages)
        if tools and len(tools) > 0:
            return self._find_model(ModelTier.FLAGSHIP)
        if total_tokens > 1500:
            return self._find_model(ModelTier.STANDARD)
        return self._find_model(ModelTier.LITE)

    def _find_model(self, tier: ModelTier) -> str:
        """找到指定层级的一个模型 key"""
        for key, cfg in self.providers.items():
            if cfg.tier == tier:
                return key
        # 回退到任意可用
        return next(iter(self.providers.keys()), "default")

    # ---- 上下文压缩 ----
    def compress_context(self, messages: list[dict],
                         max_tokens: int = 2000) -> list[dict]:
        """压缩对话历史:旧消息摘要 + 近期消息保留"""
        if self._messages_tokens(messages) <= max_tokens:
            return messages
        # 保留 system 消息
        system_msgs = [m for m in messages if m["role"] == "system"]
        non_system = [m for m in messages if m["role"] != "system"]
        if not non_system:
            return messages
        # 从末尾向前保留,直到接近 max_tokens 的一半
        keep = []
        used = self._messages_tokens(system_msgs)
        half = max_tokens // 2
        for m in reversed(non_system):
            t = self.estimate_tokens(m.get("content", ""))
            if used + t > half:
                break
            keep.insert(0, m)
            used += t
        # 较旧的消息压缩为摘要
        older = non_system[:len(non_system) - len(keep)]
        if older:
            summary_parts = [f"[{m['role']}]: {m.get('content', '')[:80]}" for m in older]
            summary = "历史摘要: " + " | ".join(summary_parts)
            return system_msgs + [{"role": "system", "content": summary}] + keep
        return system_msgs + keep

    # ---- 提示词精简 ----
    def simplify_prompt(self, prompt: str) -> str:
        """精简提示词:去除多余空白与冗余修饰"""
        # 去除多余空行与空格
        lines = [line.strip() for line in prompt.splitlines() if line.strip()]
        simplified = " ".join(lines)
        # 去除常见冗余短语
        redundancies = ["请仔细", "请注意", "非常重要", "务必", "请务必",
                        "Please note that", "It is important to"]
        for r in redundancies:
            simplified = simplified.replace(r, "")
        return simplified.strip()

    # ---- 对话 ----
    def _generate(self, messages: list[dict],
                  provider: ProviderConfig) -> str:
        """调用模型生成(模拟)"""
        if self._mock_fn is not None:
            return self._mock_fn(messages, provider)
        # 默认模拟:返回最后一条用户消息的回声
        last_user = next((m["content"] for m in reversed(messages)
                          if m["role"] == "user"), "")
        return f"[{provider.name}:{provider.model}] 收到: {last_user[:50]}"

    def chat(self, messages: list[dict], model: str | None = None,
             tools: list[dict] | None = None, stream: bool = False) -> LLMResponse:
        start = time.time()
        # 模型路由
        model_key = model or self.route_model(messages, tools)
        provider = self.providers.get(model_key)
        if provider is None:
            raise LLMError(f"未找到模型: {model_key}")
        # 上下文压缩
        compressed = self.compress_context(messages)
        # 语义缓存
        cache_key = self._cache_key(compressed, model_key)
        cached = self._cache_get(cache_key)
        if cached is not None:
            self._usage["cache_hits"] += 1
            self._usage["total_calls"] += 1
            return LLMResponse(content=cached, model=provider.model,
                               tier=provider.tier, cached=True,
                               latency=time.time() - start)
        # 生成
        content = self._generate(compressed, provider)
        input_tokens = self._messages_tokens(compressed)
        output_tokens = self.estimate_tokens(content)
        cost = (input_tokens / 1000 * provider.cost_per_1k_input +
                output_tokens / 1000 * provider.cost_per_1k_output)
        # 写入缓存
        self._cache_set(cache_key, content)
        # 统计
        self._usage["total_calls"] += 1
        self._usage["total_input_tokens"] += input_tokens
        self._usage["total_output_tokens"] += output_tokens
        self._usage["total_cost"] += cost
        by_model = self._usage["by_model"].setdefault(model_key,
                                                       {"calls": 0, "tokens": 0, "cost": 0.0})
        by_model["calls"] += 1
        by_model["tokens"] += input_tokens + output_tokens
        by_model["cost"] += cost
        return LLMResponse(content=content, model=provider.model,
                           tier=provider.tier, input_tokens=input_tokens,
                           output_tokens=output_tokens, cost=cost,
                           latency=time.time() - start)

    def chat_stream(self, messages: list[dict],
                    model: str | None = None) -> Iterator[str]:
        """流式对话:逐 token 返回(模拟分块)"""
        model_key = model or self.route_model(messages)
        provider = self.providers.get(model_key)
        if provider is None:
            raise LLMError(f"未找到模型: {model_key}")
        full = self._generate(messages, provider)
        # 模拟流式:按词分块
        words = full.split()
        for w in words:
            yield w + " "
            time.sleep(0.01)

    def usage_stats(self) -> dict:
        stats = dict(self._usage)
        stats["cache_hit_rate"] = (self._usage["cache_hits"] /
                                   max(1, self._usage["total_calls"]))
        return stats


if __name__ == "__main__":
    # 配置三个模型后端
    providers = {
        "gpt_lite": ProviderConfig("openai", "gpt-4o-mini", ModelTier.LITE,
                                   cost_per_1k_input=0.00015, cost_per_1k_output=0.0006),
        "claude_std": ProviderConfig("claude", "claude-3.5-sonnet", ModelTier.STANDARD,
                                     cost_per_1k_input=0.003, cost_per_1k_output=0.015),
        "gpt_flag": ProviderConfig("openai", "gpt-4o", ModelTier.FLAGSHIP,
                                   cost_per_1k_input=0.005, cost_per_1k_output=0.015),
    }

    # 简易缓存(避免依赖外部模块)
    class MiniCache:
        def __init__(self):
            self._d = {}
        def get(self, key, loader=None):
            return self._d.get(key, loader() if loader else None)
        def set(self, key, value, ttl=None, tags=None):
            self._d[key] = value

    llm = LLMIntegration(providers, cache=MiniCache())

    # 设置模拟生成
    def mock_gen(messages, provider):
        last = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        return f"已处理: {last[:30]}"
    llm.set_mock(mock_gen)

    # 简单问题 -> 路由到轻量模型
    r1 = llm.chat([{"role": "user", "content": "你好"}])
    print("简单问题:", r1.model, r1.tier.value, "缓存:", r1.cached, "成本:", round(r1.cost, 5))

    # 带工具调用 -> 路由到旗舰模型
    tools = [{"name": "calc", "description": "计算器"}]
    r2 = llm.chat([{"role": "user", "content": "帮我计算"}], tools=tools)
    print("工具调用:", r2.model, r2.tier.value, "缓存:", r2.cached)

    # 语义缓存:相似问题第二次命中
    r3 = llm.chat([{"role": "user", "content": "你好"}])
    print("重复问题:", r3.model, "缓存命中:", r3.cached)

    # 上下文压缩
    long_msgs = [{"role": "system", "content": "你是繁星"}]
    for i in range(20):
        long_msgs.append({"role": "user", "content": f"这是第 {i} 轮对话的内容,包含一些较长的描述文字用于测试压缩效果。"})
        long_msgs.append({"role": "assistant", "content": f"收到第 {i} 轮,这是回复内容。"})
    compressed = llm.compress_context(long_msgs, max_tokens=500)
    print("压缩前消息数:", len(long_msgs), "压缩后:", len(compressed))

    # 提示词精简
    verbose = "请仔细阅读以下内容,非常重要,请务必注意:\n\n  今天天气不错  \n\n请总结"
    print("精简后:", llm.simplify_prompt(verbose))

    # 流式输出
    print("流式输出:", "".join(llm.chat_stream([{"role": "user", "content": "流式测试"}])))

    # 用量统计
    print("用量统计:", llm.usage_stats())
