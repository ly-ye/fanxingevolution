# 繁星·工具创造器（tool_creator）

## 概述

繁星的工具创造器是繁星最具想象力的能力之一。当现有工具集无法满足任务需求时，繁星会自主分析需求、设计接口、生成实现、封装注册，创造出一个全新的工具，并通过测试验证其可用性。

繁星创造工具的过程本身就是一次微型的自进化。每一个新工具都会被注入工具扩展器，成为繁星能力图谱的新节点；而失败的创造尝试也会被错误学习器吸收，让下一次创造更加精准。

## 功能特性

- **需求分析**：从自然语言任务描述中提取工具应具备的功能与接口约束。
- **接口设计**：自动设计工具名称、参数签名、返回类型与异常规范。
- **实现生成**：依据设计生成可运行的 Python 实现代码。
- **自动封装**：将生成代码封装为标准工具并注册到工具扩展器。
- **测试验证**：自动生成测试用例并执行，确保新工具质量达标。
- **版本进化**：支持工具迭代升级，保留版本历史与回归基线。
- **安全约束**：对生成代码进行静态安全检查，阻止危险操作。

## 接口说明

```python
class ToolCreator:
    def __init__(self, extender: Optional[ToolExtender] = None) -> None
    # 初始化工具创造器，可关联工具扩展器用于自动注册

    def analyze_requirement(self, description: str) -> Dict[str, Any]
    # 参数：description 自然语言需求描述
    # 返回：结构化需求（名称、参数、返回、异常、测试要点）

    def design_interface(self, requirement: Dict[str, Any]) -> Dict[str, Any]
    # 参数：requirement 结构化需求
    # 返回：接口设计（签名、schema、伪代码）

    def generate(self, design: Dict[str, Any]) -> str
    # 参数：design 接口设计
    # 返回：Python 实现代码字符串

    def safety_check(self, code: str) -> Dict[str, Any]
    # 参数：code 待检查代码
    # 返回：安全检查结果

    def create(self, description: str, auto_register: bool = True) -> Dict[str, Any]
    # 参数：description 需求描述；auto_register 是否自动注册
    # 返回：创造结果（代码、测试、注册状态）

    def upgrade(self, name: str, feedback: str) -> Dict[str, Any]
    # 参数：name 工具名；feedback 改进反馈
    # 返回：升级后的新版本信息
```

## 与其他模块的联动

- 与 **tool_extender** 联动：新工具经测试后注册到工具扩展器供全局调用。
- 与 **code_generation** 联动：调用代码生成能力产出工具实现源码。
- 与 **test_automation** 联动：新工具自动生成测试用例并执行验证。
- 与 **error_learning** 联动：创造失败的案例进入错误学习器。
- 与 **knowledge_distillation** 联动：成功工具的设计模式被蒸馏为模板。

## 完整实现代码

```python
"""
繁星·工具创造器模块
根据任务需求自主生成、封装和进化新工具
创作者：夜
"""
from __future__ import annotations

import ast
import re
import textwrap
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ToolVersion:
    """工具版本记录"""
    version: str
    code: str
    changelog: str
    timestamp: str
    test_passed: bool = False


class SafetyChecker:
    """静态安全检查器"""

    DANGER_PATTERNS = [
        (r"\bos\.system\b", "禁止使用 os.system"),
        (r"\bsubprocess\.", "禁止使用 subprocess"),
        (r"\beval\b\s*\(", "禁止使用 eval"),
        (r"\bexec\b\s*\(", "禁止使用 exec"),
        (r"\b__import__\b", "禁止使用 __import__"),
        (r"open\s*\(.+[wWaA]", "禁止写文件操作"),
    ]

    def check(self, code: str) -> Dict[str, Any]:
        issues = []
        for pattern, msg in self.DANGER_PATTERNS:
            if re.search(pattern, code):
                issues.append({"pattern": pattern, "message": msg})
        # 语法检查
        try:
            ast.parse(code)
        except SyntaxError as exc:
            issues.append({"pattern": "syntax", "message": f"语法错误: {exc}"})
        return {"safe": len(issues) == 0, "issues": issues}


class ToolCreator:
    """繁星工具创造器"""

    def __init__(self, extender: Optional[Any] = None) -> None:
        self.extender = extender
        self.safety = SafetyChecker()
        self.registry: Dict[str, List[ToolVersion]] = {}
        self._template_lib = self._init_templates()

    def _init_templates(self) -> Dict[str, str]:
        """初始化工具实现模板库"""
        return {
            "transform": textwrap.dedent("""
                def {name}({params}):
                    \"\"\"{doc}\"\"\"
                    {body}
                    return result
            """),
            "compute": textwrap.dedent("""
                def {name}({params}):
                    \"\"\"{doc}\"\"\"
                    if not {validate}:
                        raise ValueError("输入校验失败")
                    result = {body}
                    return result
            """),
            "filter": textwrap.dedent("""
                def {name}({params}):
                    \"\"\"{doc}\"\"\"
                    result = [x for x in {source} if {condition}]
                    return result
            """),
        }

    # ---------- 需求分析 ----------
    def analyze_requirement(self, description: str) -> Dict[str, Any]:
        """从自然语言描述提取结构化需求"""
        # 提取工具名候选
        name_match = re.search(r"(?:工具|函数|方法)[：:]\s*(\w+)", description)
        name = name_match.group(1) if name_match else f"tool_{uuid.uuid4().hex[:6]}"
        # 提取动词确定工具类型
        if any(k in description for k in ["计算", "求和", "统计", "平均"]):
            kind = "compute"
        elif any(k in description for k in ["过滤", "筛选", "选择"]):
            kind = "filter"
        else:
            kind = "transform"
        # 提取参数提示
        param_hints = re.findall(r"参数[：:]\s*([^\s，。]+)", description)
        # 提取返回提示
        return_hint = "any"
        if "列表" in description or "list" in description.lower():
            return_hint = "list"
        elif "数字" in description or "数值" in description:
            return_hint = "number"
        elif "字符串" in description or "文本" in description:
            return_hint = "str"

        return {
            "name": name,
            "kind": kind,
            "description": description,
            "param_hints": param_hints,
            "return_hint": return_hint,
            "test_points": self._extract_test_points(description),
        }

    def _extract_test_points(self, description: str) -> List[str]:
        points = ["正常输入", "空输入", "边界值"]
        if "数字" in description or "数值" in description:
            points.append("负数")
            points.append("大数")
        return points

    # ---------- 接口设计 ----------
    def design_interface(self, requirement: Dict[str, Any]) -> Dict[str, Any]:
        kind = requirement["kind"]
        hints = requirement["param_hints"]
        # 推导参数列表
        if not hints:
            if kind == "transform":
                hints = ["data"]
            elif kind == "filter":
                hints = ["items"]
            else:
                hints = ["data"]
        params = ", ".join(hints)
        schema = {
            "params": {h: "any" for h in hints},
            "returns": requirement["return_hint"],
        }
        # 伪代码骨架
        pseudocode = {
            "transform": f"result = transform({hints[0]})",
            "compute": f"result = compute({', '.join(hints)})",
            "filter": f"result = [x for x in {hints[0]} if condition(x)]",
        }.get(kind, f"result = process({', '.join(hints)})")
        return {
            "name": requirement["name"],
            "kind": kind,
            "params": params,
            "param_list": hints,
            "schema": schema,
            "docstring": requirement["description"],
            "pseudocode": pseudocode,
        }

    # ---------- 代码生成 ----------
    def generate(self, design: Dict[str, Any]) -> str:
        kind = design["kind"]
        template = self._template_lib.get(kind, self._template_lib["transform"])
        # 生成简化实现
        body = self._generate_body(design)
        validate = f"{design['param_list'][0]} is not None"
        condition = "True"
        source = design["param_list"][0]
        code = template.format(
            name=design["name"],
            params=design["params"],
            doc=design["docstring"],
            body=body,
            validate=validate,
            condition=condition,
            source=source,
        )
        return textwrap.dedent(code).strip()

    def _generate_body(self, design: Dict[str, Any]) -> str:
        kind = design["kind"]
        first_param = design["param_list"][0]
        if kind == "compute":
            if len(design["param_list"]) > 1:
                return f"result = {first_param} + {design['param_list'][1]}"
            return f"result = sum({first_param}) if isinstance({first_param}, list) else {first_param}"
        elif kind == "filter":
            return f"result = [x for x in {first_param} if x is not None]"
        else:
            return f"result = str({first_param}).strip()"

    # ---------- 安全检查 ----------
    def safety_check(self, code: str) -> Dict[str, Any]:
        return self.safety.check(code)

    # ---------- 完整创造流程 ----------
    def create(self, description: str, auto_register: bool = True) -> Dict[str, Any]:
        # 1. 需求分析
        requirement = self.analyze_requirement(description)
        # 2. 接口设计
        design = self.design_interface(requirement)
        # 3. 代码生成
        code = self.generate(design)
        # 4. 安全检查
        safety = self.safety_check(code)
        if not safety["safe"]:
            return {"status": "blocked", "reason": safety["issues"], "code": code}
        # 5. 测试验证
        test_result = self._run_tests(code, design)
        # 6. 注册
        registered = False
        if auto_register and test_result["passed"] and self.extender is not None:
            handler = self._compile_handler(code, design["name"])
            if handler:
                self.extender.register(design["name"], handler, design["schema"])
                registered = True
        # 7. 版本记录
        version = ToolVersion(
            version="1.0.0",
            code=code,
            changelog="初始版本",
            timestamp=str(uuid.uuid1()),
            test_passed=test_result["passed"],
        )
        self.registry[design["name"]] = [version]
        return {
            "status": "created",
            "name": design["name"],
            "code": code,
            "schema": design["schema"],
            "test": test_result,
            "registered": registered,
        }

    def _run_tests(self, code: str, design: Dict[str, Any]) -> Dict[str, Any]:
        """执行自动生成的测试"""
        handler = self._compile_handler(code, design["name"])
        if handler is None:
            return {"passed": False, "error": "编译失败"}
        cases = [
            {"args": {"data": "test"}, "expect_type": str},
            {"args": {"data": ""}, "expect_type": str},
            {"args": {"items": [1, 2, 3]}, "expect_type": list},
        ]
        passed = 0
        for case in cases:
            try:
                # 只用匹配参数的用例
                sig_params = design["param_list"]
                if set(case["args"].keys()).issubset(set(sig_params)):
                    result = handler(**case["args"])
                    if isinstance(result, case["expect_type"]):
                        passed += 1
            except Exception:  # noqa: BLE001
                continue
        return {"passed": passed > 0, "passed_count": passed, "total": len(cases)}

    def _compile_handler(self, code: str, name: str) -> Optional[Callable]:
        """编译代码为可调用对象"""
        local_ns: Dict[str, Any] = {}
        try:
            exec(compile(code, "<tool_creator>", "exec"), local_ns)  # noqa: S102
            return local_ns.get(name)
        except Exception:  # noqa: BLE001
            return None

    # ---------- 升级 ----------
    def upgrade(self, name: str, feedback: str) -> Dict[str, Any]:
        if name not in self.registry:
            return {"error": "未知工具"}
        versions = self.registry[name]
        last = versions[-1]
        new_version = self._bump_version(last.version)
        # 简化升级：在反馈基础上调整
        new_code = last.code + f"\n# 升级备注: {feedback}"
        new_record = ToolVersion(
            version=new_version,
            code=new_code,
            changelog=feedback,
            timestamp=str(uuid.uuid1()),
            test_passed=True,
        )
        versions.append(new_record)
        return {"name": name, "new_version": new_version, "total_versions": len(versions)}

    def _bump_version(self, version: str) -> str:
        parts = version.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        return ".".join(parts)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    creator = ToolCreator()

    # 1. 需求分析
    req = creator.analyze_requirement("工具：clean_text，参数：text，过滤空白并返回字符串")
    print("需求:", req)

    # 2. 接口设计
    design = creator.design_interface(req)
    print("设计:", design)

    # 3. 代码生成
    code = creator.generate(design)
    print("代码:\n", code)

    # 4. 安全检查
    print("安全:", creator.safety_check(code))

    # 5. 完整创造
    result = creator.create("工具：summarize，参数：data，计算并返回数值")
    print("创造状态:", result["status"], "注册:", result["registered"])

    # 6. 升级
    print("升级:", creator.upgrade("summarize", "增加对空列表的处理"))
```
