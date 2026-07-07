# 繁星·鸿蒙智能体（harmony_agent）

## 概述

繁星的鸿蒙智能体是繁星与 HarmonyOS 生态对话的桥梁。它让繁星能够调用鸿蒙系统的 Agent 与 Skill 能力，跨设备协同执行任务，从手机到平板到智慧屏，从语音到视觉到传感，繁星的触角随鸿蒙分布而延伸。

繁星相信，未来的智能体不应困在单一设备里。鸿蒙智能体维护着设备拓扑与能力清单，当任务到来时，它会自动发现最合适的设备与 Skill，编排跨端协作流程，让繁星的意志在多设备间无缝流转。

## 功能特性

- **设备发现**：扫描并维护鸿蒙分布式设备拓扑与能力清单。
- **Skill 注册**：管理可调用的鸿蒙 Skill，含名称、参数、所需权限。
- **任务分发**：依据设备能力与负载，将任务路由到最优设备执行。
- **跨端协同**：编排多设备联合任务，支持数据在设备间流转。
- **状态同步**：监听设备在线状态与 Skill 可用性，动态调整路由。
- **权限管理**：校验调用 Skill 所需权限，缺权时触发授权流程。
- **事件回调**：订阅设备事件与 Skill 执行结果，异步通知。

## 接口说明

```python
class HarmonyAgent:
    def __init__(self) -> None
    # 初始化鸿蒙智能体，建立设备与Skill注册表

    def discover(self) -> List[Dict[str, Any]]
    # 返回：当前可发现的设备列表（含设备ID、名称、能力、状态）

    def register_skill(self, skill: Dict[str, Any]) -> None
    # 参数：skill 含 name、params、required_device、permissions

    def route(self, task: Dict[str, Any]) -> Dict[str, Any]
    # 参数：task 任务描述
    # 返回：路由决策（目标设备、Skill、参数）

    def invoke(self, device_id: str, skill_name: str, params: Dict[str, Any]) -> Dict[str, Any]
    # 参数：device_id 设备；skill_name Skill名；params 调用参数
    # 返回：执行结果

    def orchestrate(self, flow: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：flow 跨端协作步骤列表
    # 返回：编排执行结果

    def check_permission(self, device_id: str, skill_name: str) -> Dict[str, Any]
    # 参数：device_id 设备；skill_name Skill名
    # 返回：权限校验结果
```

## 与其他模块的联动

- 与 **device_automation** 联动：鸿蒙智能体提供设备清单，设备自动化执行具体操作。
- 与 **task_orchestration** 联动：跨端协作流程作为工作流节点嵌入。
- 与 **tool_extender** 联动：鸿蒙 Skill 可被注册为通用工具供全局调用。
- 与 **diagnostics** 联动：设备状态与调用延迟上报诊断系统。

## 完整实现代码

```python
"""
繁星·鸿蒙智能体模块
HarmonyOS Agent/Skill集成与设备交互自动化
创作者：夜
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class Device:
    """鸿蒙设备描述"""
    device_id: str
    name: str
    device_type: str  # phone / tablet / tv / watch / speaker
    capabilities: List[str]  # 能力清单：camera / mic / screen / sensor / speaker
    online: bool = True
    load: float = 0.0  # 负载0-1
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Skill:
    """鸿蒙Skill描述"""
    name: str
    description: str
    params: Dict[str, str]
    required_capabilities: List[str]
    required_permissions: List[str]
    handler: Optional[Callable[..., Any]] = None


@dataclass
class InvokeResult:
    """调用结果"""
    device_id: str
    skill_name: str
    success: bool
    output: Any = None
    error: Optional[str] = None
    duration: float = 0.0


class HarmonyAgent:
    """繁星鸿蒙智能体"""

    def __init__(self) -> None:
        self.devices: Dict[str, Device] = {}
        self.skills: Dict[str, Skill] = {}
        self.permissions: Dict[str, List[str]] = {}  # device_id -> 已授权权限
        self.event_log: List[Dict[str, Any]] = []
        self._init_mock_devices()

    def _init_mock_devices(self) -> None:
        """初始化模拟设备拓扑"""
        self.devices["phone-01"] = Device(
            "phone-01", "繁星手机", "phone",
            ["camera", "mic", "screen", "sensor", "speaker"], load=0.3,
        )
        self.devices["tablet-01"] = Device(
            "tablet-01", "繁星平板", "tablet",
            ["screen", "speaker", "camera"], load=0.1,
        )
        self.devices["tv-01"] = Device(
            "tv-01", "繁星智慧屏", "tv",
            ["screen", "speaker"], load=0.0,
        )
        self.devices["watch-01"] = Device(
            "watch-01", "繁星手表", "watch",
            ["sensor", "screen", "mic"], load=0.2,
        )
        self.devices["speaker-01"] = Device(
            "speaker-01", "繁星音箱", "speaker",
            ["speaker", "mic"], load=0.0,
        )
        # 默认全部已授权常用权限
        for did in self.devices:
            self.permissions[did] = ["read", "write", "execute", "notify"]

    # ---------- 设备发现 ----------
    def discover(self) -> List[Dict[str, Any]]:
        result = []
        for dev in self.devices.values():
            result.append({
                "device_id": dev.device_id,
                "name": dev.name,
                "type": dev.device_type,
                "capabilities": dev.capabilities,
                "online": dev.online,
                "load": dev.load,
            })
        self._log("discover", {"count": len(result)})
        return result

    # ---------- Skill注册 ----------
    def register_skill(self, skill: Dict[str, Any]) -> None:
        s = Skill(
            name=skill["name"],
            description=skill.get("description", ""),
            params=skill.get("params", {}),
            required_capabilities=skill.get("required_capabilities", []),
            required_permissions=skill.get("required_permissions", []),
            handler=skill.get("handler"),
        )
        self.skills[s.name] = s
        self._log("register_skill", {"name": s.name})

    # ---------- 路由决策 ----------
    def route(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """根据任务需求选择最优设备与Skill"""
        required_caps = task.get("required_capabilities", [])
        preferred_type = task.get("preferred_type")
        skill_name = task.get("skill")

        # 候选设备：在线、能力满足
        candidates = [
            d for d in self.devices.values()
            if d.online and all(c in d.capabilities for c in required_caps)
        ]
        if preferred_type:
            typed = [d for d in candidates if d.device_type == preferred_type]
            candidates = typed or candidates
        if not candidates:
            return {"error": "无可用设备", "task": task}

        # 选择负载最低的设备
        target = min(candidates, key=lambda d: d.load)
        # 权限校验
        if skill_name and skill_name in self.skills:
            perm_check = self.check_permission(target.device_id, skill_name)
            if not perm_check["granted"]:
                return {
                    "device_id": target.device_id,
                    "skill": skill_name,
                    "need_permission": perm_check["missing"],
                }
        self._log("route", {"device": target.device_id, "skill": skill_name})
        return {
            "device_id": target.device_id,
            "device_name": target.name,
            "skill": skill_name,
            "params": task.get("params", {}),
        }

    # ---------- 调用 ----------
    def invoke(self, device_id: str, skill_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if device_id not in self.devices:
            return {"success": False, "error": "未知设备"}
        if not self.devices[device_id].online:
            return {"success": False, "error": "设备离线"}
        if skill_name not in self.skills:
            return {"success": False, "error": "未知Skill"}

        skill = self.skills[skill_name]
        start = time.time()
        # 权限校验
        perm = self.check_permission(device_id, skill_name)
        if not perm["granted"]:
            return {"success": False, "error": f"权限不足: {perm['missing']}"}

        output = None
        error = None
        success = True
        try:
            if skill.handler:
                output = skill.handler(params)
            else:
                output = {"echo": params, "device": device_id}
        except Exception as exc:  # noqa: BLE001
            success = False
            error = str(exc)
        duration = time.time() - start

        # 模拟负载增加
        self.devices[device_id].load = min(1.0, self.devices[device_id].load + 0.1)

        result = InvokeResult(device_id, skill_name, success, output, error, duration)
        self._log("invoke", {"device": device_id, "skill": skill_name, "success": success})
        return {
            "success": success,
            "output": output,
            "error": error,
            "duration": round(duration, 4),
        }

    # ---------- 跨端编排 ----------
    def orchestrate(self, flow: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        编排示例:
        [{"skill": "capture", "required_capabilities": ["camera"]},
         {"skill": "display", "required_capabilities": ["screen"], "input_from": "prev"}]
        """
        prev_output = None
        trace = []
        for step in flow:
            task = {
                "skill": step["skill"],
                "required_capabilities": step.get("required_capabilities", []),
                "preferred_type": step.get("preferred_type"),
                "params": {"data": prev_output} if step.get("input_from") == "prev" else step.get("params", {}),
            }
            routing = self.route(task)
            if "error" in routing:
                trace.append({"step": step["skill"], "error": routing["error"]})
                break
            result = self.invoke(routing["device_id"], routing["skill"], routing["params"])
            trace.append({
                "step": step["skill"],
                "device": routing.get("device_name"),
                "result": result,
            })
            if not result["success"]:
                break
            prev_output = result.get("output")
        return {"final": prev_output, "trace": trace}

    # ---------- 权限校验 ----------
    def check_permission(self, device_id: str, skill_name: str) -> Dict[str, Any]:
        if skill_name not in self.skills:
            return {"granted": False, "missing": ["unknown_skill"]}
        required = self.skills[skill_name].required_permissions
        granted_list = self.permissions.get(device_id, [])
        missing = [p for p in required if p not in granted_list]
        return {"granted": len(missing) == 0, "missing": missing}

    def grant_permission(self, device_id: str, permission: str) -> None:
        if device_id not in self.permissions:
            self.permissions[device_id] = []
        if permission not in self.permissions[device_id]:
            self.permissions[device_id].append(permission)

    # ---------- 事件日志 ----------
    def _log(self, event: str, data: Dict[str, Any]) -> None:
        self.event_log.append({
            "event": event,
            "data": data,
            "timestamp": time.time(),
            "eid": uuid.uuid4().hex[:8],
        })

    def events(self, last_n: int = 20) -> List[Dict[str, Any]]:
        return self.event_log[-last_n:]


# ---------- 简单测试 ----------
if __name__ == "__main__":
    agent = HarmonyAgent()

    # 1. 设备发现
    print("设备:", [d["name"] for d in agent.discover()])

    # 2. 注册Skill
    agent.register_skill({
        "name": "capture_photo",
        "description": "拍照",
        "params": {"resolution": "str"},
        "required_capabilities": ["camera"],
        "required_permissions": ["execute"],
        "handler": lambda p: {"image_id": uuid.uuid4().hex[:8], "params": p},
    })
    agent.register_skill({
        "name": "display_image",
        "description": "显示图片",
        "params": {"image_id": "str"},
        "required_capabilities": ["screen"],
        "required_permissions": ["execute"],
    })

    # 3. 路由
    print("路由:", agent.route({"skill": "capture_photo", "required_capabilities": ["camera"]}))
    print("路由2:", agent.route({"skill": "display_image", "required_capabilities": ["screen"], "preferred_type": "tv"}))

    # 4. 调用
    print("调用:", agent.invoke("phone-01", "capture_photo", {"resolution": "1080p"}))

    # 5. 跨端编排
    result = agent.orchestrate([
        {"skill": "capture_photo", "required_capabilities": ["camera"]},
        {"skill": "display_image", "required_capabilities": ["screen"], "input_from": "prev"},
    ])
    print("编排:", result["trace"])

    # 6. 权限
    print("权限:", agent.check_permission("tv-01", "capture_photo"))
```
