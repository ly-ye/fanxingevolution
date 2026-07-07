# 繁星·Skill 市场（skill_market）

## 概述

繁星的 Skill 市场是繁星向外延展触角的集市。它让繁星能够发现、安装、版本管理与权限控制外部 Skill,把繁星自身的能力边界从内核扩展到整个生态。每一个 Skill 都是一颗可插拔的星,装上即亮,卸下即灭。

市场不是无门槛的集市。每个 Skill 都带着能力声明、权限需求与签名,繁星在安装前会校验签名、审查权限、匹配版本,确保引入的 Skill 不会成为繁星躯体里的暗刺。安装后的 Skill 受权限控制模块约束,只能在授予的权限范围内活动。

## 功能特性

- **Skill 发现**:从市场索引中发现可用 Skill,支持搜索与过滤。
- **安装与卸载**:一键安装到本地,卸载时清理资源。
- **版本管理**:支持多版本共存、版本切换、版本锁定。
- **权限控制**:安装时声明权限,经审批后授予,运行时受控。
- **签名校验**:Skill 包带签名,安装前校验完整性与来源。
- **依赖解析**:Skill 间依赖关系解析,自动安装依赖。
- **更新检测**:周期检测已安装 Skill 的新版本,提示更新。

## 接口说明

```python
class SkillMarket:
    def __init__(self, local_root: str, permission_control=None) -> None
    # 初始化市场,local_root 为本地安装目录,permission_control 为权限控制模块。

    def search(self, keyword: str, category: str | None = None) -> list[SkillMeta]
    # 搜索市场中的 Skill。

    def install(self, skill_id: str, version: str = "latest",
                approve_permissions: bool = False) -> InstallResult
    # 安装指定版本的 Skill,返回安装结果。

    def uninstall(self, skill_id: str) -> bool
    # 卸载 Skill。

    def update(self, skill_id: str) -> InstallResult
    # 更新 Skill 到最新版本。

    def list_installed(self) -> list[InstalledSkill]
    # 列出已安装的 Skill。

    def get(self, skill_id: str) -> InstalledSkill | None
    # 获取已安装 Skill 的实例与元信息。

    def lock_version(self, skill_id: str, version: str) -> None
    # 锁定 Skill 版本,阻止自动更新。

    def check_updates(self) -> list[UpdateInfo]
    # 检测所有已安装 Skill 的可用更新。
```

## 与其他模块的联动

- **permission_control**:Skill 的权限声明经权限控制模块审批与运行时约束。
- **plugin_system**:安装的 Skill 通过插件系统加载为可执行插件。
- **configuration_management**:Skill 的配置项通过配置管理注入。
- **scheduler**:周期性触发 `check_updates` 检测更新。
- **notification_center**:发现高危 Skill 或更新可用时,通过通知中心告知。

## 完整实现代码

```python
"""繁星·Skill 市场

外部 Skill 发现、安装、版本管理与权限控制。
作者:夜
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class SkillCategory(str, Enum):
    TOOL = "tool"
    DATA_SOURCE = "data_source"
    MODEL = "model"
    INTEGRATION = "integration"
    UTILITY = "utility"


@dataclass
class SkillMeta:
    """市场中的 Skill 元信息"""
    skill_id: str
    name: str
    category: SkillCategory
    description: str = ""
    latest_version: str = "1.0.0"
    all_versions: list[str] = field(default_factory=lambda: ["1.0.0"])
    publisher: str = ""
    signature: str = ""
    permissions: list[str] = field(default_factory=list)  # 声明所需权限
    dependencies: list[str] = field(default_factory=list)  # 依赖的其他 skill_id
    download_size: int = 0
    rating: float = 0.0


@dataclass
class InstalledSkill:
    """已安装的 Skill"""
    skill_id: str
    version: str
    installed_at: float = field(default_factory=time.time)
    permissions_granted: list[str] = field(default_factory=list)
    locked: bool = False
    entry: Callable | None = None  # Skill 入口函数(模拟)


@dataclass
class InstallResult:
    """安装结果"""
    success: bool
    skill_id: str
    version: str = ""
    error: str = ""
    permissions_granted: list[str] = field(default_factory=list)
    dependencies_installed: list[str] = field(default_factory=list)


@dataclass
class UpdateInfo:
    """更新信息"""
    skill_id: str
    current_version: str
    latest_version: str
    available: bool


class SkillMarket:
    """繁星·Skill 市场"""

    def __init__(self, local_root: str, permission_control: Any = None) -> None:
        self.local_root = local_root
        self.permission_control = permission_control
        # 模拟市场索引
        self._registry: dict[str, SkillMeta] = {}
        # 本地已安装
        self._installed: dict[str, InstalledSkill] = {}
        os.makedirs(local_root, exist_ok=True)

    # ---- 市场索引(模拟) ----
    def publish(self, meta: SkillMeta) -> None:
        """发布一个 Skill 到市场(供测试)"""
        self._registry[meta.skill_id] = meta

    def search(self, keyword: str, category: str | None = None) -> list[SkillMeta]:
        results = []
        for meta in self._registry.values():
            if category and meta.category.value != category:
                continue
            if keyword.lower() in meta.name.lower() or keyword.lower() in meta.description.lower():
                results.append(meta)
        results.sort(key=lambda m: m.rating, reverse=True)
        return results

    # ---- 签名校验(模拟) ----
    def _verify_signature(self, meta: SkillMeta) -> bool:
        """校验 Skill 包签名(模拟:非空即通过)"""
        return bool(meta.signature)

    def _verify_integrity(self, meta: SkillMeta) -> bool:
        """校验完整性(模拟)"""
        expected = hashlib.sha1(f"{meta.skill_id}{meta.latest_version}".encode()).hexdigest()[:8]
        return True  # 简化:始终通过

    # ---- 权限审批 ----
    def _request_permissions(self, meta: SkillMeta,
                             approve: bool) -> list[str]:
        """请求权限审批"""
        if not meta.permissions:
            return []
        if approve:
            return list(meta.permissions)
        if self.permission_control is not None and hasattr(self.permission_control, "approve"):
            granted = []
            for perm in meta.permissions:
                if self.permission_control.approve(meta.skill_id, perm):
                    granted.append(perm)
            return granted
        return []  # 未批准

    # ---- 依赖解析 ----
    def _resolve_dependencies(self, meta: SkillMeta) -> list[str]:
        """解析并安装依赖(返回新安装的依赖 ID)"""
        installed_deps = []
        for dep_id in meta.dependencies:
            if dep_id not in self._installed and dep_id in self._registry:
                dep_meta = self._registry[dep_id]
                result = self.install(dep_id, approve_permissions=True)
                if result.success:
                    installed_deps.append(dep_id)
        return installed_deps

    # ---- 安装 ----
    def install(self, skill_id: str, version: str = "latest",
                approve_permissions: bool = False) -> InstallResult:
        meta = self._registry.get(skill_id)
        if meta is None:
            return InstallResult(False, skill_id, error="市场中未找到该 Skill")
        # 签名与完整性校验
        if not self._verify_signature(meta):
            return InstallResult(False, skill_id, error="签名校验失败")
        if not self._verify_integrity(meta):
            return InstallResult(False, skill_id, error="完整性校验失败")
        # 版本选择
        target_version = version if version != "latest" else meta.latest_version
        if target_version not in meta.all_versions:
            return InstallResult(False, skill_id, error=f"版本 {target_version} 不存在")
        # 权限审批
        granted = self._request_permissions(meta, approve_permissions)
        if meta.permissions and not granted:
            return InstallResult(False, skill_id, error="权限未获批准")
        # 依赖解析
        deps = self._resolve_dependencies(meta)
        # 安装(模拟:创建目录标记)
        skill_dir = os.path.join(self.local_root, skill_id, target_version)
        os.makedirs(skill_dir, exist_ok=True)
        installed = InstalledSkill(skill_id=skill_id, version=target_version,
                                   permissions_granted=granted)
        self._installed[skill_id] = installed
        return InstallResult(True, skill_id, version=target_version,
                             permissions_granted=granted,
                             dependencies_installed=deps)

    # ---- 卸载 ----
    def uninstall(self, skill_id: str) -> bool:
        if skill_id not in self._installed:
            return False
        # 检查是否有其他 Skill 依赖它
        dependents = [sid for sid, s in self._installed.items()
                      if sid != skill_id and
                      self._registry.get(sid) and
                      skill_id in (self._registry[sid].dependencies or [])]
        if dependents:
            return False  # 有依赖,不可卸载
        skill_dir = os.path.join(self.local_root, skill_id)
        if os.path.exists(skill_dir):
            import shutil
            shutil.rmtree(skill_dir, ignore_errors=True)
        del self._installed[skill_id]
        return True

    # ---- 更新 ----
    def update(self, skill_id: str) -> InstallResult:
        installed = self._installed.get(skill_id)
        if installed is None:
            return InstallResult(False, skill_id, error="未安装")
        if installed.locked:
            return InstallResult(False, skill_id, error="版本已锁定")
        meta = self._registry.get(skill_id)
        if meta is None or meta.latest_version == installed.version:
            return InstallResult(False, skill_id, error="已是最新版本")
        # 卸载旧版再安装新版
        old_perms = installed.permissions_granted
        self._installed.pop(skill_id)
        result = self.install(skill_id, approve_permissions=True)
        # 保留已授予权限
        if result.success:
            self._installed[skill_id].permissions_granted = old_perms
        return result

    # ---- 查询 ----
    def list_installed(self) -> list[InstalledSkill]:
        return list(self._installed.values())

    def get(self, skill_id: str) -> InstalledSkill | None:
        return self._installed.get(skill_id)

    def lock_version(self, skill_id: str, version: str) -> None:
        installed = self._installed.get(skill_id)
        if installed and installed.version == version:
            installed.locked = True

    def unlock_version(self, skill_id: str) -> None:
        installed = self._installed.get(skill_id)
        if installed:
            installed.locked = False

    def check_updates(self) -> list[UpdateInfo]:
        updates = []
        for sid, installed in self._installed.items():
            meta = self._registry.get(sid)
            if meta is None:
                continue
            available = (not installed.locked and
                         meta.latest_version != installed.version)
            updates.append(UpdateInfo(sid, installed.version,
                                      meta.latest_version, available))
        return updates


if __name__ == "__main__":
    market = SkillMarket(local_root="./.fanxing_skills")

    # 发布 Skill 到市场
    market.publish(SkillMeta(
        skill_id="web_search", name="网页搜索", category=SkillCategory.TOOL,
        description="全网搜索与摘要", latest_version="2.1.0",
        all_versions=["2.0.0", "2.1.0"], publisher="night",
        signature="signed", permissions=["net.read"], rating=4.7,
    ))
    market.publish(SkillMeta(
        skill_id="pdf_reader", name="PDF 解析", category=SkillCategory.UTILITY,
        description="PDF 文本提取", latest_version="1.2.0",
        all_versions=["1.0.0", "1.2.0"], publisher="night",
        signature="signed", permissions=["file.read"],
        dependencies=["text_utils"], rating=4.5,
    ))
    market.publish(SkillMeta(
        skill_id="text_utils", name="文本工具", category=SkillCategory.UTILITY,
        description="文本处理基础库", latest_version="0.9.0",
        all_versions=["0.9.0"], publisher="night",
        signature="signed", permissions=[], rating=4.9,
    ))

    # 搜索
    print("搜索 '文本':", [m.name for m in market.search("文本")])
    print("搜索 'PDF':", [m.name for m in market.search("pdf")])

    # 安装(带依赖自动解析)
    result = market.install("pdf_reader", approve_permissions=True)
    print("安装 pdf_reader:", result.success, "版本", result.version,
          "依赖", result.dependencies_installed, "权限", result.permissions_granted)

    # 已安装列表
    print("已安装:", [(s.skill_id, s.version) for s in market.list_installed()])

    # 发布新版本后检查更新
    market._registry["web_search"].latest_version = "2.2.0"
    market._registry["web_search"].all_versions.append("2.2.0")
    market.install("web_search", approve_permissions=True)
    market._registry["web_search"].latest_version = "2.3.0"
    market._registry["web_search"].all_versions.append("2.3.0")
    print("可用更新:", [(u.skill_id, u.current_version, "->", u.latest_version)
                        for u in market.check_updates() if u.available])

    # 锁定版本后不可更新
    market.lock_version("web_search", "2.2.0")
    print("锁定后更新结果:", market.update("web_search").error)
