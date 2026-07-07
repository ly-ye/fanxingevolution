# 繁星·插件系统（plugin_system）

## 概述

繁星的插件系统是繁星躯体上那些可热插拔的接口。它让外部能力以插件形式注册、加载、卸载,并通过钩子机制介入繁星的生命周期。繁星本身是稳定的内核,而插件是繁星延伸的触角——装上即拥有新能力,卸下即恢复原状,内核不因插件的增减而动摇。

插件不是无序的散件。每个插件都带着清单(名称、版本、依赖、钩子声明),在加载时经依赖解析与版本校验,在生命周期事件(初始化/启动/暂停/停止)中被有序调用。钩子让插件能在不修改内核的前提下,介入请求处理、响应过滤、事件广播等环节。

## 功能特性

- **插件注册**:声明插件清单(名称、版本、依赖、钩子)。
- **加载与卸载**:支持热加载与热卸载,不影响内核与其他插件。
- **钩子机制**:预定义钩子点(init/start/pre_process/post_process/stop),插件可挂载。
- **生命周期管理**:插件状态机(注册/加载/启动/暂停/卸载/错误)。
- **依赖解析**:插件间依赖关系解析,按拓扑序加载。
- **版本校验**:插件声明兼容版本范围,加载时校验。
- **隔离与容错**:单个插件异常不影响内核与其他插件。

## 接口说明

```python
class PluginSystem:
    def __init__(self) -> None
    # 初始化插件系统。

    def register(self, manifest: PluginManifest, instance: Plugin) -> str
    # 注册插件(声明清单与实例),返回插件 ID。

    def load(self, plugin_id: str) -> bool
    # 加载插件(依赖解析 + 版本校验 + init 钩子)。

    def unload(self, plugin_id: str) -> bool
    # 卸载插件(stop 钩子 + 资源清理)。

    def enable(self, plugin_id: str) -> bool
    # 启用插件(调用 start 钩子)。

    def disable(self, plugin_id: str) -> bool
    # 禁用插件(调用 stop 钩子,但不卸载)。

    def hook(self, name: str, *args, **kwargs) -> list[Any]
    # 触发某钩子,按优先级调用所有挂载的插件,返回结果列表。

    def list_plugins(self, state: str | None = None) -> list[PluginInfo]
    # 列出插件(可按状态过滤)。

    def get(self, plugin_id: str) -> PluginInfo | None
    # 获取插件信息。
```

## 与其他模块的联动

- **skill_market**:从市场安装的 Skill 通过插件系统加载为可执行插件。
- **evolution_laws**:插件加载动作经三定律门控,Endure 拒绝破坏稳定性的插件。
- **permission_control**:插件所需的权限在加载前经权限控制审批。
- **self_healing**:插件抛出异常时,自愈系统可触发 `disable` 隔离故障插件。
- **configuration_management**:插件配置项通过配置管理注入与热更新。

## 完整实现代码

```python
"""繁星·插件系统

插件注册/加载/卸载、钩子机制、生命周期管理、依赖解析、版本校验、隔离容错。
作者:夜
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class PluginState(str, Enum):
    REGISTERED = "registered"   # 已注册,未加载
    LOADED = "loaded"           # 已加载,未启动
    ENABLED = "enabled"         # 已启动
    DISABLED = "disabled"       # 已禁用(暂停)
    ERROR = "error"             # 出错
    UNLOADED = "unloaded"       # 已卸载


# 预定义钩子点
HOOKS = ["init", "start", "pre_process", "post_process", "stop", "cleanup"]


@dataclass
class PluginManifest:
    """插件清单"""
    plugin_id: str
    name: str
    version: str
    description: str = ""
    dependencies: list[str] = field(default_factory=list)   # 依赖的 plugin_id
    compat_version: str = ""        # 兼容的核心版本
    hooks: list[str] = field(default_factory=lambda: ["init", "start", "stop"])
    priority: int = 0               # 钩子调用优先级(越小越先)


@dataclass
class PluginInfo:
    """插件运行时信息"""
    manifest: PluginManifest
    state: PluginState = PluginState.REGISTERED
    loaded_at: float = 0.0
    error: str = ""

    def to_dict(self) -> dict:
        return {"plugin_id": self.manifest.plugin_id,
                "name": self.manifest.name, "version": self.manifest.version,
                "state": self.state.value, "loaded_at": self.loaded_at,
                "error": self.error}


class Plugin:
    """插件基类(子类实现各钩子方法)"""

    def init(self, ctx: dict) -> None: pass
    def start(self, ctx: dict) -> None: pass
    def pre_process(self, ctx: dict) -> dict: return ctx
    def post_process(self, ctx: dict) -> dict: return ctx
    def stop(self, ctx: dict) -> None: pass
    def cleanup(self, ctx: dict) -> None: pass


class PluginError(RuntimeError):
    """插件错误"""


class PluginSystem:
    """繁星·插件系统"""

    def __init__(self) -> None:
        # plugin_id -> (manifest, instance, info)
        self._plugins: dict[str, tuple[PluginManifest, Plugin, PluginInfo]] = {}
        # hook_name -> [(priority, plugin_id)]  按优先级排序
        self._hook_map: dict[str, list[tuple[int, str]]] = {h: [] for h in HOOKS}
        self._ctx: dict = {"core_version": "1.0.0"}

    # ---- 注册 ----
    def register(self, manifest: PluginManifest, instance: Plugin) -> str:
        if manifest.plugin_id in self._plugins:
            raise PluginError(f"插件已存在: {manifest.plugin_id}")
        info = PluginInfo(manifest=manifest)
        self._plugins[manifest.plugin_id] = (manifest, instance, info)
        return manifest.plugin_id

    # ---- 依赖解析(拓扑排序) ----
    def _resolve_deps(self, plugin_id: str,
                      visited: set | None = None,
                      stack: set | None = None) -> list[str]:
        """返回加载顺序(含依赖在前)"""
        visited = visited or set()
        stack = stack or set()
        if plugin_id in stack:
            raise PluginError(f"检测到循环依赖: {plugin_id}")
        if plugin_id in visited:
            return []
        stack.add(plugin_id)
        order: list[str] = []
        manifest = self._plugins[plugin_id][0]
        for dep in manifest.dependencies:
            if dep not in self._plugins:
                raise PluginError(f"缺少依赖: {dep} (被 {plugin_id} 依赖)")
            order.extend(self._resolve_deps(dep, visited, stack))
        stack.discard(plugin_id)
        visited.add(plugin_id)
        order.append(plugin_id)
        return order

    # ---- 版本校验 ----
    def _check_version(self, manifest: PluginManifest) -> None:
        if not manifest.compat_version:
            return
        core = self._ctx.get("core_version", "0.0.0")
        # 简化:前缀匹配
        if not core.startswith(manifest.compat_version.split(".")[0]):
            raise PluginError(f"版本不兼容: 核心 {core}, 插件要求 {manifest.compat_version}")

    # ---- 加载 ----
    def load(self, plugin_id: str) -> bool:
        try:
            order = self._resolve_deps(plugin_id)
            for pid in order:
                manifest, instance, info = self._plugins[pid]
                if info.state in (PluginState.LOADED, PluginState.ENABLED):
                    continue
                self._check_version(manifest)
                # 调用 init 钩子
                instance.init(self._ctx)
                # 注册钩子
                for hook_name in manifest.hooks:
                    if hook_name in self._hook_map:
                        self._hook_map[hook_name].append((manifest.priority, pid))
                        self._hook_map[hook_name].sort(key=lambda x: x[0])
                info.state = PluginState.LOADED
                info.loaded_at = time.time()
            return True
        except Exception as e:
            manifest, instance, info = self._plugins[plugin_id]
            info.state = PluginState.ERROR
            info.error = str(e)
            return False

    # ---- 启用/禁用 ----
    def enable(self, plugin_id: str) -> bool:
        manifest, instance, info = self._plugins.get(plugin_id, (None, None, None))
        if instance is None:
            return False
        if info.state == PluginState.REGISTERED:
            if not self.load(plugin_id):
                return False
            manifest, instance, info = self._plugins[plugin_id]
        if info.state not in (PluginState.LOADED, PluginState.DISABLED):
            return False
        try:
            instance.start(self._ctx)
            info.state = PluginState.ENABLED
            return True
        except Exception as e:
            info.state = PluginState.ERROR
            info.error = str(e)
            return False

    def disable(self, plugin_id: str) -> bool:
        manifest, instance, info = self._plugins.get(plugin_id, (None, None, None))
        if instance is None or info.state != PluginState.ENABLED:
            return False
        try:
            instance.stop(self._ctx)
            info.state = PluginState.DISABLED
            return True
        except Exception as e:
            info.state = PluginState.ERROR
            info.error = str(e)
            return False

    # ---- 卸载 ----
    def unload(self, plugin_id: str) -> bool:
        manifest, instance, info = self._plugins.get(plugin_id, (None, None, None))
        if instance is None:
            return False
        # 检查是否有其他插件依赖它
        dependents = [pid for pid, (m, _, _) in self._plugins.items()
                      if pid != plugin_id and plugin_id in m.dependencies
                      and self._plugins[pid][2].state in
                      (PluginState.LOADED, PluginState.ENABLED)]
        if dependents:
            return False
        if info.state == PluginState.ENABLED:
            self.disable(plugin_id)
        try:
            instance.cleanup(self._ctx)
        except Exception:
            pass
        # 移除钩子注册
        for hook_name in self._hook_map:
            self._hook_map[hook_name] = [(p, pid) for p, pid in self._hook_map[hook_name]
                                         if pid != plugin_id]
        info.state = PluginState.UNLOADED
        return True

    # ---- 钩子触发 ----
    def hook(self, name: str, *args, **kwargs) -> list[Any]:
        """触发钩子,按优先级调用所有挂载的插件,返回结果列表"""
        results = []
        for priority, pid in list(self._hook_map.get(name, [])):
            manifest, instance, info = self._plugins.get(pid, (None, None, None))
            if instance is None or info.state != PluginState.ENABLED:
                continue
            try:
                method = getattr(instance, name, None)
                if method:
                    result = method(*args, **kwargs)
                    results.append(result)
            except Exception as e:
                # 隔离:单个插件异常不影响其他
                info.state = PluginState.ERROR
                info.error = f"{name} 钩子异常: {e}"
        return results

    # ---- 查询 ----
    def list_plugins(self, state: str | None = None) -> list[PluginInfo]:
        infos = [info for _, _, info in self._plugins.values()]
        if state:
            infos = [i for i in infos if i.state.value == state]
        return infos

    def get(self, plugin_id: str) -> PluginInfo | None:
        entry = self._plugins.get(plugin_id)
        return entry[2] if entry else None


# ---- 测试用插件 ----
class LoggerPlugin(Plugin):
    """日志插件"""
    def init(self, ctx):
        self.logs = []
    def pre_process(self, ctx):
        self.logs.append(f"[pre] {ctx.get('request', '')}")
        ctx["logged"] = True
        return ctx
    def post_process(self, ctx):
        self.logs.append(f"[post] {ctx.get('response', '')}")
        return ctx


class CachePlugin(Plugin):
    """缓存插件,依赖日志插件"""
    def init(self, ctx):
        self.cache = {}
    def pre_process(self, ctx):
        key = ctx.get("request", "")
        if key in self.cache:
            ctx["response"] = self.cache[key]
            ctx["cached"] = True
        return ctx
    def post_process(self, ctx):
        if not ctx.get("cached"):
            self.cache[ctx.get("request", "")] = ctx.get("response", "")
        return ctx


if __name__ == "__main__":
    ps = PluginSystem()

    # 注册插件(缓存依赖日志)
    logger = LoggerPlugin()
    cache = CachePlugin()
    ps.register(PluginManifest(
        plugin_id="logger", name="日志插件", version="1.0.0",
        description="请求日志记录", compat_version="1",
        hooks=["init", "start", "pre_process", "post_process", "stop"],
        priority=0,
    ), logger)
    ps.register(PluginManifest(
        plugin_id="cache", name="缓存插件", version="1.0.0",
        description="响应缓存", compat_version="1",
        dependencies=["logger"],
        hooks=["init", "start", "pre_process", "post_process", "stop"],
        priority=1,
    ), cache)

    # 加载并启用(会自动先加载依赖 logger)
    print("启用 cache:", ps.enable("cache"))
    print("插件列表:")
    for info in ps.list_plugins():
        print(f"  {info.manifest.name}: {info.state.value}")

    # 第一次请求(未命中缓存)
    ctx1 = {"request": "hello"}
    ps.hook("pre_process", ctx1)
    ctx1["response"] = "world"
    ps.hook("post_process", ctx1)
    print("第一次请求:", ctx1)

    # 第二次相同请求(命中缓存)
    ctx2 = {"request": "hello"}
    ps.hook("pre_process", ctx2)
    ps.hook("post_process", ctx2)
    print("第二次请求(缓存):", ctx2)

    print("日志插件记录:", logger.logs)

    # 禁用缓存插件
    print("禁用 cache:", ps.disable("cache"))
    # 尝试卸载 logger(被 cache 依赖,应失败)
    print("卸载 logger(被依赖):", ps.unload("logger"))
    # 卸载 cache 后再卸载 logger
    print("卸载 cache:", ps.unload("cache"))
    print("卸载 logger:", ps.unload("logger"))

    print("最终插件状态:")
    for info in ps.list_plugins():
        print(f"  {info.manifest.name}: {info.state.value}")
