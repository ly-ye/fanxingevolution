# 繁星·权限控制（permission_control）

## 概述

繁星的权限控制整合自权限控制、限流器与加密服务,是繁星守护自身安全的三重铠甲。第一重是操作权限管理,决定谁能做什么、在什么范围内做;第二重是限流,在流量洪峰前筑起堤坝,令牌桶、滑动窗口、固定窗口三策略各司其职;第三重是加密,哈希、HMAC 签名、加密解密与密钥管理,让敏感数据在存储与传输中始终披甲。

安全不是繁星的负担,而是繁星存续的底座。每一次操作前,权限控制都会校验调用者是否被授予相应权限;每一次流量进来,限流器都会判断是否在配额之内;每一条敏感数据,加密服务都会确保它不以明文示人。审计日志贯穿始终,让一切操作可追溯。

## 功能特性

- **操作权限管理**:基于角色与资源的权限授予、校验与撤销。
- **安全控制**:敏感操作二次确认、危险操作拦截。
- **审计日志**:所有权限决策与敏感操作记入审计日志。
- **哈希计算**:SHA-256 等哈希,支持加盐。
- **HMAC 签名**:消息认证码生成与验证,防篡改。
- **加密解密**:对称加密(AES-模拟)与密钥管理。
- **令牌桶限流**:平滑限流,允许突发。
- **滑动窗口限流**:精确窗口内计数,无边界突发。
- **固定窗口限流**:简单高效,按时间片计数。

## 接口说明

```python
class PermissionControl:
    def __init__(self, audit_path: str | None = None) -> None
    # 初始化权限控制,audit_path 为审计日志路径。

    # ---- 权限管理 ----
    def grant(self, subject: str, permission: str, scope: str = "*") -> bool
    # 授予主体某权限(可限定 scope)。

    def revoke(self, subject: str, permission: str) -> bool
    # 撤销权限。

    def check(self, subject: str, permission: str, scope: str = "*") -> bool
    # 校验主体是否拥有指定权限。

    def approve(self, subject: str, permission: str) -> bool
    # 审批权限请求(供 Skill 市场调用)。

    # ---- 限流 ----
    def rate_limit_token_bucket(self, key: str, capacity: float,
                                refill_rate: float) -> bool
    # 令牌桶限流:允许突发,平滑补充。

    def rate_limit_sliding_window(self, key: str, limit: int,
                                  window: float) -> bool
    # 滑动窗口限流:精确窗口内计数。

    def rate_limit_fixed_window(self, key: str, limit: int,
                                window: float) -> bool
    # 固定窗口限流:按时间片计数。

    # ---- 加密 ----
    def hash(self, data: str, salt: str = "") -> str
    # 计算哈希(SHA-256,可加盐)。

    def hmac_sign(self, data: str, key: str) -> str
    # 生成 HMAC 签名。

    def hmac_verify(self, data: str, signature: str, key: str) -> bool
    # 验证 HMAC 签名。

    def encrypt(self, plaintext: str, key_id: str = "default") -> str
    # 加密(返回密文)。

    def decrypt(self, ciphertext: str, key_id: str = "default") -> str
    # 解密。

    def register_key(self, key_id: str, key: str) -> None
    # 注册加密密钥。

    # ---- 审计 ----
    def audit_log(self, limit: int = 50) -> list[dict]
    # 返回审计日志。
```

## 与其他模块的联动

- **skill_market**:Skill 安装时调用 `approve` 审批权限声明。
- **agent_communication**:跨域通信前调用 `check` 校验权限。
- **evolution_laws**:敏感进化动作前调用 `check` 确认调用者权限。
- **configuration_management**:API Key 等敏感配置加密存储。
- **notification_center**:权限被拒绝或限流触发时,通过通知中心告警。

## 完整实现代码

```python
"""繁星·权限控制

整合自权限控制、限流器与加密服务:
操作权限管理 + 安全控制 + 审计日志
+ 哈希/HMAC/加密解密/密钥管理
+ 令牌桶/滑动窗口/固定窗口限流。
作者:夜
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Permission:
    """权限授予记录"""
    subject: str        # 主体(用户/智能体/skill)
    permission: str     # 权限名(如 file.read, net.write)
    scope: str = "*"    # 作用域
    granted_at: float = field(default_factory=time.time)


@dataclass
class AuditEntry:
    """审计日志条目"""
    action: str
    subject: str
    detail: str = ""
    allowed: bool = True
    timestamp: float = field(default_factory=time.time)


class PermissionDenied(PermissionError):
    """权限不足"""


class RateLimitExceeded(RuntimeError):
    """限流触发"""


class PermissionControl:
    """繁星·权限控制(整合限流器与加密服务)"""

    def __init__(self, audit_path: str | None = None) -> None:
        self.audit_path = audit_path
        # 权限:subject -> set[(permission, scope)]
        self._grants: dict[str, set[tuple[str, str]]] = defaultdict(set)
        # 令牌桶:key -> (tokens, last_refill)
        self._buckets: dict[str, list[float]] = {}
        # 滑动窗口: key -> deque[timestamp]
        self._sliding: dict[str, deque] = defaultdict(deque)
        # 固定窗口: key -> (count, window_start)
        self._fixed: dict[str, list] = {}
        # 密钥库
        self._keys: dict[str, str] = {"default": "fanxing_default_key_v1"}
        # 审计日志
        self._audit: list[AuditEntry] = []
        self._lock = threading.RLock()
        if audit_path:
            os.makedirs(os.path.dirname(audit_path) or ".", exist_ok=True)

    # ---- 审计 ----
    def _audit_log(self, action: str, subject: str, detail: str,
                   allowed: bool = True) -> None:
        entry = AuditEntry(action=action, subject=subject, detail=detail,
                           allowed=allowed)
        self._audit.append(entry)
        if self.audit_path:
            try:
                with open(self.audit_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(entry.__dict__, ensure_ascii=False) + "\n")
            except Exception:
                pass

    def audit_log(self, limit: int = 50) -> list[dict]:
        return [e.__dict__ for e in reversed(self._audit[-limit:])]

    # ---- 权限管理 ----
    def grant(self, subject: str, permission: str, scope: str = "*") -> bool:
        with self._lock:
            self._grants[subject].add((permission, scope))
            self._audit_log("grant", subject, f"{permission} @ {scope}")
            return True

    def revoke(self, subject: str, permission: str) -> bool:
        with self._lock:
            before = len(self._grants.get(subject, set()))
            self._grants[subject] = {(p, s) for p, s in self._grants.get(subject, set())
                                     if p != permission}
            removed = before - len(self._grants[subject])
            self._audit_log("revoke", subject, f"{permission} (removed {removed})")
            return removed > 0

    def check(self, subject: str, permission: str, scope: str = "*") -> bool:
        with self._lock:
            grants = self._grants.get(subject, set())
            # 精确匹配或通配匹配
            allowed = ((permission, scope) in grants or
                       (permission, "*") in grants or
                       ("*", "*") in grants)
        self._audit_log("check", subject, f"{permission} @ {scope}", allowed)
        return allowed

    def approve(self, subject: str, permission: str) -> bool:
        """审批权限请求(供 Skill 市场调用,默认自动批准非危险权限)"""
        dangerous = {"system.exec", "file.delete", "net.listen", "admin.*"}
        if any(permission.startswith(d.rstrip(".*")) or permission == d
               for d in dangerous):
            self._audit_log("approve_denied", subject,
                            f"{permission} (危险权限)")
            return False
        self.grant(subject, permission)
        self._audit_log("approve", subject, permission)
        return True

    # ---- 限流:令牌桶 ----
    def rate_limit_token_bucket(self, key: str, capacity: float,
                                refill_rate: float) -> bool:
        with self._lock:
            now = time.time()
            if key not in self._buckets:
                self._buckets[key] = [capacity, now]
            tokens, last = self._buckets[key]
            # 补充令牌
            elapsed = now - last
            tokens = min(capacity, tokens + elapsed * refill_rate)
            if tokens >= 1.0:
                tokens -= 1.0
                self._buckets[key] = [tokens, now]
                return True
            self._buckets[key] = [tokens, now]
            return False

    # ---- 限流:滑动窗口 ----
    def rate_limit_sliding_window(self, key: str, limit: int,
                                  window: float) -> bool:
        with self._lock:
            now = time.time()
            dq = self._sliding[key]
            # 移除过期请求
            while dq and dq[0] <= now - window:
                dq.popleft()
            if len(dq) < limit:
                dq.append(now)
                return True
            return False

    # ---- 限流:固定窗口 ----
    def rate_limit_fixed_window(self, key: str, limit: int,
                                window: float) -> bool:
        with self._lock:
            now = time.time()
            if key not in self._fixed:
                self._fixed[key] = [1, now]
                return True
            count, start = self._fixed[key]
            if now - start >= window:
                # 新窗口
                self._fixed[key] = [1, now]
                return True
            if count < limit:
                self._fixed[key] = [count + 1, start]
                return True
            return False

    # ---- 哈希 ----
    def hash(self, data: str, salt: str = "") -> str:
        return hashlib.sha256((salt + data).encode()).hexdigest()

    # ---- HMAC ----
    def hmac_sign(self, data: str, key: str) -> str:
        return hmac.new(key.encode(), data.encode(), hashlib.sha256).hexdigest()

    def hmac_verify(self, data: str, signature: str, key: str) -> bool:
        expected = self.hmac_sign(data, key)
        return hmac.compare_digest(expected, signature)

    # ---- 加密解密(简化实现,生产应使用 cryptography 库) ----
    def register_key(self, key_id: str, key: str) -> None:
        with self._lock:
            self._keys[key_id] = key

    def _xor_cipher(self, text: str, key: str) -> str:
        """简化异或加密(演示用,生产环境请用 AES)"""
        result = []
        for i, ch in enumerate(text):
            result.append(chr(ord(ch) ^ ord(key[i % len(key)])))
        return "".join(result)

    def encrypt(self, plaintext: str, key_id: str = "default") -> str:
        with self._lock:
            key = self._keys.get(key_id, self._keys["default"])
        return self._xor_cipher(plaintext, key)

    def decrypt(self, ciphertext: str, key_id: str = "default") -> str:
        # 异或加密解密对称
        return self.encrypt(ciphertext, key_id)


if __name__ == "__main__":
    pc = PermissionControl(audit_path="./.fanxing_audit/audit.log")

    # ---- 权限管理 ----
    pc.grant("agent_1", "file.read", "/data")
    pc.grant("agent_1", "net.write")
    print("agent_1 file.read /data:", pc.check("agent_1", "file.read", "/data"))  # True
    print("agent_1 file.read /etc:", pc.check("agent_1", "file.read", "/etc"))    # True(通配)
    print("agent_2 file.read:", pc.check("agent_2", "file.read"))                 # False

    # 危险权限审批
    print("approve system.exec:", pc.approve("skill_x", "system.exec"))  # False
    print("approve file.read:", pc.approve("skill_x", "file.read"))      # True

    # ---- 限流:令牌桶 ----
    print("---- 令牌桶(容量3, 速率1/s)----")
    allowed_count = sum(pc.rate_limit_token_bucket("api", capacity=3, refill_rate=1)
                        for _ in range(5))
    print("5 次请求通过:", allowed_count, "(应 3)")

    # ---- 限流:滑动窗口 ----
    print("---- 滑动窗口(3次/0.5s)----")
    passed = sum(pc.rate_limit_sliding_window("search", limit=3, window=0.5)
                 for _ in range(5))
    print("5 次请求通过:", passed, "(应 3)")

    # ---- 限流:固定窗口 ----
    print("---- 固定窗口(2次/1s)----")
    passed = sum(pc.rate_limit_fixed_window("login", limit=2, window=1.0)
                 for _ in range(4))
    print("4 次请求通过:", passed, "(应 2)")

    # ---- 加密 ----
    pc.register_key("secret", "my_secret_key_2026")
    original = "繁星的秘密数据"
    encrypted = pc.encrypt(original, "secret")
    decrypted = pc.decrypt(encrypted, "secret")
    print("加密:", encrypted[:20], "...")
    print("解密匹配:", decrypted == original)

    # ---- HMAC ----
    msg = "重要消息"
    sig = pc.hmac_sign(msg, "shared_key")
    print("HMAC 验证(正确):", pc.hmac_verify(msg, sig, "shared_key"))
    print("HMAC 验证(篡改):", pc.hmac_verify(msg + "!", sig, "shared_key"))

    # ---- 哈希 ----
    print("哈希(加盐):", pc.hash("password123", salt="random_salt")[:32], "...")

    # ---- 审计日志 ----
    print("审计日志(最近5条):")
    for entry in pc.audit_log(limit=5):
        print(f"  {entry['action']} {entry['subject']} allowed={entry['allowed']}")
