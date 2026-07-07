# 繁星·设备自动化（device_automation）

## 概述

繁星的设备自动化整合自浏览器自动化与桌面自动化，是繁星与现实数字界面交互的统一通道。无论是网页上的表单填写、数据抓取、截图取证，还是桌面上的鼠标键盘操控、窗口管理、GUI 识别，繁星都通过同一条自动化通道完成。

繁星相信，自动化不应被设备形态割裂。浏览器与桌面共享统一的状态机与动作原语，繁星根据目标场景选择适配的执行后端，让跨界面的自动化流程一气呵成。

## 功能特性

- **浏览器自动化**：网页导航、表单填写、元素抓取、截图、等待控制。
- **桌面自动化**：鼠标移动与点击、键盘输入、屏幕截图、窗口查找。
- **统一通道**：浏览器与桌面共享动作原语与状态记录接口。
- **元素定位**：支持 CSS 选择器、XPath、坐标、图像匹配多策略定位。
- **动作录制**：记录动作序列，支持回放与参数化重放。
- **异常恢复**：元素未找到、超时时自动重试与降级策略。
- **截图取证**：关键步骤自动截图，便于审计与调试。

## 接口说明

```python
class DeviceAutomation:
    def __init__(self) -> None
    # 初始化设备自动化统一通道

    def navigate(self, url: str) -> Dict[str, Any]
    # 参数：url 目标网址
    # 返回：导航结果（浏览器后端）

    def click(self, target: Dict[str, Any], backend: str = "auto") -> Dict[str, Any]
    # 参数：target 定位信息（selector/xpath/coords/image）；backend 浏览器/桌面/auto
    # 返回：点击结果

    def type_text(self, target: Dict[str, Any], text: str, backend: str = "auto") -> Dict[str, Any]
    # 参数：target 定位；text 输入文本；backend 后端
    # 返回：输入结果

    def scrape(self, selector: str, attr: Optional[str] = None) -> Dict[str, Any]
    # 参数：selector CSS选择器；attr 属性名，None取文本
    # 返回：抓取结果列表（浏览器后端）

    def screenshot(self, region: Optional[Dict[str, int]] = None) -> Dict[str, Any]
    # 参数：region 截图区域，None全屏
    # 返回：截图信息（路径、尺寸）

    def find_window(self, title: str) -> Dict[str, Any]
    # 参数：title 窗口标题关键词
    # 返回：窗口信息（桌面后端）

    def record(self, action: Dict[str, Any]) -> None
    # 参数：action 待记录的动作
    # 返回：无

    def replay(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]
    # 参数：params 重放时覆盖的参数
    # 返回：重放结果
```

## 与其他模块的联动

- 与 **harmony_agent** 联动：鸿蒙设备作为额外后端接入设备自动化通道。
- 与 **tool_extender** 联动：自动化动作可被封装为工具供全局调用。
- 与 **task_orchestration** 联动：自动化步骤作为工作流节点。
- 与 **diagnostics** 联动：动作耗时与失败率上报诊断系统。

## 完整实现代码

```python
"""
繁星·设备自动化模块
整合自浏览器自动化与桌面自动化：网页操作/表单/抓取/截图 与 鼠标键盘/截图/GUI 统一通道
创作者：夜
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ActionRecord:
    """动作记录"""
    action: str
    target: Optional[Dict[str, Any]]
    params: Dict[str, Any]
    result: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    screenshot: Optional[str] = None


class BrowserBackend:
    """浏览器自动化后端（模拟实现）"""

    def __init__(self) -> None:
        self.current_url = "about:blank"
        self.dom: Dict[str, Any] = {}  # 模拟DOM
        self._init_mock_dom()

    def _init_mock_dom(self) -> None:
        self.dom = {
            "#search-input": {"tag": "input", "text": "", "attrs": {"value": ""}},
            ".result-item": [
                {"tag": "div", "text": "繁星搜索结果1", "attrs": {}},
                {"tag": "div", "text": "繁星搜索结果2", "attrs": {}},
                {"tag": "div", "text": "繁星搜索结果3", "attrs": {}},
            ],
            "#login-form": {"tag": "form", "text": "", "attrs": {}},
            "#username": {"tag": "input", "text": "", "attrs": {"value": ""}},
            "#password": {"tag": "input", "text": "", "attrs": {"value": ""}},
            "#submit": {"tag": "button", "text": "登录", "attrs": {}},
        }

    def navigate(self, url: str) -> Dict[str, Any]:
        self.current_url = url
        return {"success": True, "url": url, "title": f"页面-{url[:20]}"}

    def click(self, target: Dict[str, Any]) -> Dict[str, Any]:
        el = self._find(target)
        if el is None:
            return {"success": False, "error": "元素未找到"}
        return {"success": True, "clicked": target}

    def type_text(self, target: Dict[str, Any], text: str) -> Dict[str, Any]:
        el = self._find(target)
        if el is None:
            return {"success": False, "error": "元素未找到"}
        if isinstance(el, dict):
            el["attrs"]["value"] = text
        return {"success": True, "typed": text}

    def scrape(self, selector: str, attr: Optional[str] = None) -> Dict[str, Any]:
        el = self.dom.get(selector)
        if el is None:
            return {"success": False, "error": "选择器未匹配", "items": []}
        if isinstance(el, list):
            items = [e.get("attrs", {}).get(attr, e.get("text")) if attr else e.get("text") for e in el]
            return {"success": True, "items": items, "count": len(items)}
        value = el.get("attrs", {}).get(attr) if attr else el.get("text")
        return {"success": True, "items": [value], "count": 1}

    def screenshot(self, region: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        path = f"screenshot_{uuid.uuid4().hex[:6]}.png"
        size = region or {"x": 0, "y": 0, "w": 1920, "h": 1080}
        return {"success": True, "path": path, "size": size}

    def _find(self, target: Dict[str, Any]) -> Any:
        if "selector" in target:
            return self.dom.get(target["selector"])
        if "xpath" in target:
            # 简化：用xpath末尾id模拟
            return self.dom.get(target["xpath"].split("/")[-1].lstrip("@#"))
        return None


class DesktopBackend:
    """桌面自动化后端（模拟实现）"""

    def __init__(self) -> None:
        self.windows: List[Dict[str, Any]] = [
            {"title": "记事本", "handle": "win-001", "rect": {"x": 100, "y": 100, "w": 800, "h": 600}},
            {"title": "浏览器", "handle": "win-002", "rect": {"x": 50, "y": 50, "w": 1200, "h": 800}},
            {"title": "终端", "handle": "win-003", "rect": {"x": 200, "y": 200, "w": 600, "h": 400}},
        ]
        self.mouse_pos = {"x": 0, "y": 0}
        self.active_window: Optional[str] = None

    def click(self, target: Dict[str, Any]) -> Dict[str, Any]:
        if "coords" in target:
            self.mouse_pos = {"x": target["coords"]["x"], "y": target["coords"]["y"]}
            return {"success": True, "pos": self.mouse_pos, "button": target.get("button", "left")}
        if "image" in target:
            # 模拟图像匹配定位
            self.mouse_pos = {"x": 500, "y": 400}
            return {"success": True, "pos": self.mouse_pos, "matched": target["image"]}
        return {"success": False, "error": "无法定位点击目标"}

    def type_text(self, target: Dict[str, Any], text: str) -> Dict[str, Any]:
        # 桌面端先点击再输入
        if "coords" in target or "image" in target:
            click_result = self.click(target)
            if not click_result["success"]:
                return click_result
        return {"success": True, "typed": text, "keys": len(text)}

    def screenshot(self, region: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        path = f"desktop_{uuid.uuid4().hex[:6]}.png"
        size = region or {"x": 0, "y": 0, "w": 1920, "h": 1080}
        return {"success": True, "path": path, "size": size}

    def find_window(self, title: str) -> Dict[str, Any]:
        for win in self.windows:
            if title.lower() in win["title"].lower():
                self.active_window = win["handle"]
                return {"success": True, **win}
        return {"success": False, "error": "窗口未找到"}

    def key_press(self, keys: List[str]) -> Dict[str, Any]:
        return {"success": True, "keys": keys}


class DeviceAutomation:
    """繁星设备自动化统一通道"""

    def __init__(self) -> None:
        self.browser = BrowserBackend()
        self.desktop = DesktopBackend()
        self.records: List[ActionRecord] = []
        self.retries = 2
        self.timeout = 5.0

    def _select_backend(self, target: Dict[str, Any], backend: str = "auto") -> str:
        if backend != "auto":
            return backend
        # 自动判断：含selector/xpath走浏览器，含coords/image走桌面
        if "selector" in target or "xpath" in target:
            return "browser"
        if "coords" in target or "image" in target:
            return "desktop"
        return "browser"

    # ---------- 浏览器操作 ----------
    def navigate(self, url: str) -> Dict[str, Any]:
        result = self.browser.navigate(url)
        self.record({"action": "navigate", "target": None, "params": {"url": url}, "result": result})
        return result

    def click(self, target: Dict[str, Any], backend: str = "auto") -> Dict[str, Any]:
        chosen = self._select_backend(target, backend)
        last_error = None
        for attempt in range(self.retries + 1):
            if chosen == "browser":
                result = self.browser.click(target)
            else:
                result = self.desktop.click(target)
            if result["success"]:
                self.record({"action": "click", "target": target, "params": {"backend": chosen}, "result": result})
                return result
            last_error = result.get("error")
            time.sleep(0.1 * (attempt + 1))
        return {"success": False, "error": last_error, "retries": self.retries}

    def type_text(self, target: Dict[str, Any], text: str, backend: str = "auto") -> Dict[str, Any]:
        chosen = self._select_backend(target, backend)
        if chosen == "browser":
            result = self.browser.type_text(target, text)
        else:
            result = self.desktop.type_text(target, text)
        self.record({"action": "type_text", "target": target,
                     "params": {"text": text, "backend": chosen}, "result": result})
        return result

    def scrape(self, selector: str, attr: Optional[str] = None) -> Dict[str, Any]:
        result = self.browser.scrape(selector, attr)
        self.record({"action": "scrape", "target": {"selector": selector},
                     "params": {"attr": attr}, "result": result})
        return result

    def screenshot(self, region: Optional[Dict[str, int]] = None, backend: str = "browser") -> Dict[str, Any]:
        if backend == "desktop":
            result = self.desktop.screenshot(region)
        else:
            result = self.browser.screenshot(region)
        self.record({"action": "screenshot", "target": None,
                     "params": {"region": region, "backend": backend}, "result": result})
        return result

    def find_window(self, title: str) -> Dict[str, Any]:
        result = self.desktop.find_window(title)
        self.record({"action": "find_window", "target": None,
                     "params": {"title": title}, "result": result})
        return result

    def key_press(self, keys: List[str]) -> Dict[str, Any]:
        result = self.desktop.key_press(keys)
        self.record({"action": "key_press", "target": None,
                     "params": {"keys": keys}, "result": result})
        return result

    # ---------- 动作录制与回放 ----------
    def record(self, action: Dict[str, Any]) -> None:
        self.records.append(ActionRecord(
            action=action["action"],
            target=action.get("target"),
            params=action.get("params", {}),
            result=action.get("result", {}),
        ))

    def replay(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        params = params or {}
        results = []
        for rec in self.records:
            # 参数覆盖
            overridden = {**rec.params, **params.get(rec.action, {})}
            if rec.action == "navigate":
                results.append(self.navigate(overridden.get("url", "")))
            elif rec.action == "click" and rec.target:
                results.append(self.click(rec.target, overridden.get("backend", "auto")))
            elif rec.action == "type_text" and rec.target:
                results.append(self.type_text(rec.target, overridden.get("text", ""), overridden.get("backend", "auto")))
            elif rec.action == "scrape":
                sel = rec.target.get("selector", "") if rec.target else ""
                results.append(self.scrape(sel, overridden.get("attr")))
            elif rec.action == "screenshot":
                results.append(self.screenshot(overridden.get("region"), overridden.get("backend", "browser")))
        return {"replayed": len(results), "results": results}

    def history(self, last_n: int = 20) -> List[Dict[str, Any]]:
        return [r.__dict__ for r in self.records[-last_n:]]


# ---------- 简单测试 ----------
if __name__ == "__main__":
    da = DeviceAutomation()

    # 1. 浏览器自动化
    print("导航:", da.navigate("https://example.com"))
    print("输入:", da.type_text({"selector": "#search-input"}, "繁星自进化"))
    print("点击:", da.click({"selector": "#submit"}))
    print("抓取:", da.scrape(".result-item"))
    print("截图:", da.screenshot())

    # 2. 桌面自动化
    print("找窗口:", da.find_window("记事本"))
    print("桌面点击:", da.click({"coords": {"x": 300, "y": 200}}, backend="desktop"))
    print("桌面输入:", da.type_text({"coords": {"x": 300, "y": 200}}, "Hello繁星", backend="desktop"))
    print("按键:", da.key_press(["ctrl", "s"]))

    # 3. 回放
    replay_result = da.replay({"type_text": {"text": "覆盖文本"}})
    print("回放数:", replay_result["replayed"])

    # 4. 历史
    print("历史动作数:", len(da.history()))
```
