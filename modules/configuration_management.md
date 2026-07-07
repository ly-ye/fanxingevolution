# 繁星·配置管理（configuration_management）

## 概述

繁星的配置管理是繁星存放万千参数的星图仓库。它把分散在各模块的配置集中存储、版本化、并支持热更新与环境隔离。繁星相信,配置是进化的脚手架——好的配置管理让繁星在调整自身行为时,无需重启,无需停摆,只需轻轻拨动一个旋钮。

配置不是一成不变的文本。每项配置都带着版本号、环境标签与变更历史,热更新在写入后立即生效并通知订阅者,环境管理让繁星在开发、测试、生产之间安全切换。每一次变更都留痕,可回滚到任意历史版本。

## 功能特性

- **配置存储**:分层配置(默认/环境/覆盖),支持嵌套结构与类型校验。
- **版本控制**:每次变更生成版本,支持 diff 与回滚。
- **热更新**:配置变更后实时通知订阅者,无需重启。
- **环境管理**:开发/测试/生产多环境隔离与切换。
- **类型校验**:配置项可声明类型与范围,写入时校验。
- **密钥保护**:敏感配置加密存储,读取时解密。
- **变更通知**:订阅者监听配置变更,自动响应。

## 接口说明

```python
class ConfigurationManagement:
    def __init__(self, store_path: str, environment: str = "dev") -> None
    # 初始化配置管理,environment 为当前环境。

    def set(self, key: str, value: Any, env: str | None = None,
            sensitive: bool = False) -> str
    # 写入配置项,返回版本 ID。sensitive 为 True 时加密存储。

    def get(self, key: str, default: Any = None, env: str | None = None) -> Any
    # 读取配置项,按 覆盖/环境/默认 优先级解析。

    def delete(self, key: str, env: str | None = None) -> bool
    # 删除配置项。

    def subscribe(self, key: str, callback: Callable[[str, Any], None]) -> None
    # 订阅某配置项的变更通知。

    def switch_environment(self, env: str) -> None
    # 切换当前环境。

    def list_keys(self, prefix: str = "", env: str | None = None) -> list[str]
    # 列出配置键(支持前缀过滤)。

    def history(self, key: str, limit: int = 10) -> list[dict]
    # 返回某配置项的变更历史。

    def rollback(self, key: str, version_id: str) -> Any
    # 回滚配置项到指定版本。

    def export(self, env: str | None = None) -> dict
    # 导出某环境(或全部)的配置快照。
```

## 与其他模块的联动

- **所有模块**:各模块的参数(阈值、容量、策略)均通过配置管理注入与热更新。
- **self_healing**:健康检查阈值、伸缩参数通过配置热更新。
- **scheduler**:调度间隔、cron 表达式通过配置管理。
- **permission_control**:加密密钥、限流阈值通过配置管理(标记 sensitive)。
- **notification_center**:告警阈值、订阅关系通过配置管理。

## 完整实现代码

```python
"""繁星·配置管理

配置存储、版本控制、热更新、环境管理、类型校验、密钥保护。
作者:夜
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ConfigRecord:
    """一条配置记录"""
    key: str
    value: Any
    env: str            # 环境标签
    version: str = ""
    sensitive: bool = False
    created_at: float = field(default_factory=time.time)
    author: str = "system"

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value, "env": self.env,
                "version": self.version, "sensitive": self.sensitive,
                "created_at": self.created_at, "author": self.author}


class ConfigError(RuntimeError):
    """配置错误"""


# 简单的"加密"(演示用,生产应使用真加密库)
def _obfuscate(value: str) -> str:
    return hashlib.sha1(value.encode()).hexdigest()[:8] + "::" + value[::-1]


def _deobfuscate(stored: str) -> str:
    if "::" in stored:
        return stored.split("::", 1)[1][::-1]
    return stored


class ConfigurationManagement:
    """繁星·配置管理器"""

    def __init__(self, store_path: str, environment: str = "dev") -> None:
        self.store_path = store_path
        self.environment = environment
        # 配置: env -> key -> ConfigRecord(当前生效)
        self._config: dict[str, dict[str, ConfigRecord]] = {}
        # 历史: key -> [ConfigRecord]
        self._history: dict[str, list[ConfigRecord]] = {}
        # 订阅: key -> [callback]
        self._subscribers: dict[str, list[Callable[[str, Any], None]]] = {}
        # 类型约束: key -> (type, validator)
        self._schema: dict[str, tuple[type, Callable[[Any], bool] | None]] = {}
        self._lock = threading.RLock()
        os.makedirs(store_path, exist_ok=True)
        self._load()

    # ---- 持久化 ----
    def _path(self) -> str:
        return os.path.join(self.store_path, "config.json")

    def _load(self) -> None:
        path = self._path()
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for env, kv in data.get("config", {}).items():
            self._config[env] = {}
            for key, rec in kv.items():
                record = ConfigRecord(**rec)
                if record.sensitive and isinstance(record.value, str):
                    record.value = _deobfuscate(record.value)
                self._config[env][key] = record
        for key, recs in data.get("history", {}).items():
            self._history[key] = [ConfigRecord(**r) for r in recs]

    def _save(self) -> None:
        config_dump = {}
        for env, kv in self._config.items():
            config_dump[env] = {}
            for key, rec in kv.items():
                d = rec.to_dict()
                if rec.sensitive and isinstance(rec.value, str):
                    d["value"] = _obfuscate(rec.value)
                config_dump[env][key] = d
        history_dump = {}
        for key, recs in self._history.items():
            history_dump[key] = []
            for rec in recs:
                d = rec.to_dict()
                if rec.sensitive and isinstance(rec.value, str):
                    d["value"] = _obfuscate(rec.value)
                history_dump[key].append(d)
        with open(self._path(), "w", encoding="utf-8") as f:
            json.dump({"config": config_dump, "history": history_dump},
                      f, ensure_ascii=False, indent=2)

    # ---- Schema ----
    def define(self, key: str, typ: type,
               validator: Callable[[Any], bool] | None = None) -> None:
        """定义配置项的类型与校验"""
        self._schema[key] = (typ, validator)

    def _validate(self, key: str, value: Any) -> None:
        if key not in self._schema:
            return
        typ, validator = self._schema[key]
        if not isinstance(value, typ):
            raise ConfigError(f"配置 {key} 类型错误,期望 {typ},实际 {type(value)}")
        if validator and not validator(value):
            raise ConfigError(f"配置 {key} 值 {value} 未通过校验")

    # ---- 版本 ----
    def _new_version(self, key: str, value: Any) -> str:
        raw = f"{key}:{value}:{time.time()}"
        return hashlib.sha1(raw.encode()).hexdigest()[:10]

    # ---- 读写 ----
    def set(self, key: str, value: Any, env: str | None = None,
            sensitive: bool = False, author: str = "system") -> str:
        target_env = env or self.environment
        self._validate(key, value)
        with self._lock:
            version = self._new_version(key, value)
            record = ConfigRecord(key=key, value=value, env=target_env,
                                  version=version, sensitive=sensitive,
                                  author=author)
            self._config.setdefault(target_env, {})[key] = record
            self._history.setdefault(key, []).append(record)
            self._save()
            # 通知订阅者(热更新)
            for cb in self._subscribers.get(key, []):
                try:
                    cb(key, value)
                except Exception:
                    pass
            return version

    def get(self, key: str, default: Any = None, env: str | None = None) -> Any:
        target_env = env or self.environment
        with self._lock:
            # 优先级:目标环境 -> 默认环境 -> default
            record = (self._config.get(target_env, {}).get(key)
                      or self._config.get("default", {}).get(key))
            if record is None:
                return default
            return record.value

    def delete(self, key: str, env: str | None = None) -> bool:
        target_env = env or self.environment
        with self._lock:
            kv = self._config.get(target_env, {})
            if key not in kv:
                return False
            del kv[key]
            self._save()
            return True

    # ---- 订阅 ----
    def subscribe(self, key: str, callback: Callable[[str, Any], None]) -> None:
        with self._lock:
            self._subscribers.setdefault(key, []).append(callback)

    def unsubscribe(self, key: str, callback: Callable) -> None:
        with self._lock:
            if key in self._subscribers:
                self._subscribers[key] = [cb for cb in self._subscribers[key]
                                          if cb != callback]

    # ---- 环境 ----
    def switch_environment(self, env: str) -> None:
        self.environment = env

    def list_environments(self) -> list[str]:
        return list(self._config.keys())

    def list_keys(self, prefix: str = "", env: str | None = None) -> list[str]:
        target_env = env or self.environment
        keys = set()
        for e in [target_env, "default"]:
            for k in self._config.get(e, {}):
                if k.startswith(prefix):
                    keys.add(k)
        return sorted(keys)

    # ---- 历史与回滚 ----
    def history(self, key: str, limit: int = 10) -> list[dict]:
        with self._lock:
            recs = self._history.get(key, [])[-limit:]
            return [r.to_dict() for r in reversed(recs)]

    def rollback(self, key: str, version_id: str) -> Any:
        with self._lock:
            recs = self._history.get(key, [])
            target = next((r for r in recs if r.version == version_id), None)
            if target is None:
                raise ConfigError(f"版本 {version_id} 不存在")
            # 创建新版本(值为旧值),保持版本链
            new_ver = self._new_version(key, target.value)
            new_rec = ConfigRecord(key=key, value=target.value,
                                    env=self.environment, version=new_ver,
                                    sensitive=target.sensitive,
                                    author="rollback")
            self._config.setdefault(self.environment, {})[key] = new_rec
            self._history.setdefault(key, []).append(new_rec)
            self._save()
            return target.value

    def export(self, env: str | None = None) -> dict:
        with self._lock:
            if env:
                return {k: r.to_dict() for k, r in self._config.get(env, {}).items()}
            return {e: {k: r.to_dict() for k, r in kv.items()}
                    for e, kv in self._config.items()}


if __name__ == "__main__":
    cm = ConfigurationManagement(store_path="./.fanxing_config", environment="dev")

    # 定义类型约束
    cm.define("cache.max_size", int, lambda v: 0 < v <= 100000)
    cm.define("scheduler.interval", float, lambda v: v > 0)

    # 写入配置(默认环境 + dev 环境)
    cm.set("cache.max_size", 1024, env="default")
    cm.set("cache.max_size", 2048, env="dev")  # dev 环境覆盖
    cm.set("scheduler.interval", 0.5)

    # 读取(优先 dev 环境)
    print("cache.max_size (dev):", cm.get("cache.max_size"))       # 2048
    print("cache.max_size (prod):", cm.get("cache.max_size", env="prod"))  # 2048 -> 不存在 -> default 1024

    # 热更新订阅
    events = []
    cm.subscribe("cache.max_size", lambda k, v: events.append((k, v)))
    cm.set("cache.max_size", 4096, env="dev")  # 触发订阅
    print("热更新事件:", events)

    # 敏感配置
    cm.set("security.api_key", "secret_123", sensitive=True)
    print("敏感配置值:", cm.get("security.api_key"))

    # 历史与回滚
    print("cache.max_size 历史:")
    for h in cm.history("cache.max_size"):
        print(f"  v{h['version'][:6]} = {h['value']} @ {h['env']}")
    first_version = cm.history("cache.max_size")[-1]["version"]
    rolled = cm.rollback("cache.max_size", first_version)
    print("回滚后值:", rolled)

    # 环境切换
    cm.switch_environment("prod")
    cm.set("cache.max_size", 8192, env="prod")
    print("prod 环境 cache.max_size:", cm.get("cache.max_size"))
    print("环境列表:", cm.list_environments())

    # 类型校验
    try:
        cm.set("cache.max_size", "not_int")
    except ConfigError as e:
        print("类型校验拦截:", e)
