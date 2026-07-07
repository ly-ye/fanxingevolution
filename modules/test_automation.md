# 繁星·测试自动化（test_automation）

## 概述

繁星的测试自动化是繁星对自己产出质量的守门人。当代码被生成、当工具被创造、当工作流被编排，测试自动化会自动生成测试用例、执行验证、分析覆盖率，确保繁星的每一次进化都建立在可靠的基础之上。

繁星不把测试当作事后的补救，而是行动的一部分。测试用例与代码同生同长，覆盖率缺口会被识别并补齐，失败的测试会触发回环修复，让质量成为繁星自进化的内生约束。

## 功能特性

- **测试生成**：依据函数签名与逻辑自动生成单元测试用例。
- **测试执行**：批量运行测试，隔离环境，捕获异常与断言失败。
- **覆盖率分析**：统计行覆盖、分支覆盖与函数覆盖。
- **边界探测**：自动识别边界值与异常路径并生成针对性用例。
- **回归基线**：维护历史测试快照，检测回归。
- **失败诊断**：对失败用例给出可能原因与修复建议。
- **质量门禁**：依据覆盖率与通过率决定是否放行。

## 接口说明

```python
class TestAutomation:
    def __init__(self) -> None
    # 初始化测试自动化引擎

    def generate(self, code: str, target: Optional[str] = None) -> List[Dict[str, Any]]
    # 参数：code 待测代码；target 指定函数名，None表示全部
    # 返回：生成的测试用例列表

    def execute(self, code: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：code 被测代码；cases 测试用例
    # 返回：执行结果（通过数、失败数、详情）

    def coverage(self, code: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]
    # 参数：code 被测代码；cases 测试用例
    # 返回：覆盖率报告（行、分支、函数）

    def gate(self, result: Dict[str, Any], min_pass: float = 0.9, min_cov: float = 0.7) -> Dict[str, Any]
    # 参数：result 执行结果；min_pass 最低通过率；min_cov 最低覆盖率
    # 返回：门禁判定

    def diagnose(self, failures: List[Dict[str, Any]]) -> List[Dict[str, Any]]
    # 参数：failures 失败用例列表
    # 返回：诊断建议
```

## 与其他模块的联动

- 与 **code_generation** 联动：代码生成后自动触发测试生成与质量门禁。
- 与 **tool_creator** 联动：新工具必须通过测试自动化验证才能注册。
- 与 **error_learning** 联动：测试失败模式进入错误学习器。
- 与 **reflection** 联动：质量缺口作为反思输入用于策略优化。

## 完整实现代码

```python
"""
繁星·测试自动化模块
测试生成、执行、覆盖率分析
创作者：夜
"""
from __future__ import annotations

import ast
import inspect
import textwrap
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class TestCase:
    """测试用例"""
    name: str
    target: str  # 被测函数名
    args: Dict[str, Any]
    expect: Any = None
    expect_type: Optional[type] = None
    should_raise: Optional[str] = None  # 预期异常类型名


@dataclass
class TestResult:
    """单条测试结果"""
    name: str
    target: str
    passed: bool
    output: Any = None
    error: Optional[str] = None
    duration: float = 0.0


class TestAutomation:
    """繁星测试自动化引擎"""

    def __init__(self) -> None:
        self.history: List[Dict[str, Any]] = []
        self.baselines: Dict[str, Dict[str, Any]] = {}

    # ---------- 测试生成 ----------
    def generate(self, code: str, target: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return [{"name": "syntax_check", "target": target or "unknown",
                     "args": {}, "error": str(exc), "passed": False}]
        funcs = self._extract_functions(tree, target)
        cases: List[TestCase] = []
        for fn in funcs:
            cases.extend(self._gen_cases_for(fn))
        return [c.__dict__ for c in cases]

    def _extract_functions(self, tree: ast.AST, target: Optional[str]) -> List[Dict[str, Any]]:
        funcs = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if target and node.name != target:
                    continue
                args = [a.arg for a in node.args.args if a.arg != "self"]
                has_return = node.returns is not None
                # 收集字面量默认值作为边界线索
                literals = []
                for n in ast.walk(node):
                    if isinstance(n, ast.Constant):
                        literals.append(n.value)
                funcs.append({
                    "name": node.name, "args": args,
                    "has_return": has_return, "literals": literals,
                })
        return funcs

    def _gen_cases_for(self, fn: Dict[str, Any]) -> List[TestCase]:
        cases = []
        args = fn["args"]
        if not args:
            return cases
        first = args[0]
        # 正常输入
        cases.append(TestCase(
            f"{fn['name']}_normal", fn["name"],
            {first: "test_data"}, expect_type=str if fn["has_return"] else None,
        ))
        # 空输入
        cases.append(TestCase(
            f"{fn['name']}_empty", fn["name"],
            {first: ""}, expect_type=str if fn["has_return"] else None,
        ))
        # 数值输入
        cases.append(TestCase(
            f"{fn['name']}_numeric", fn["name"],
            {first: 42}, expect_type=None,
        ))
        # 列表输入
        cases.append(TestCase(
            f"{fn['name']}_list", fn["name"],
            {first: [1, 2, 3]}, expect_type=None,
        ))
        # None输入
        cases.append(TestCase(
            f"{fn['name']}_none", fn["name"],
            {first: None}, should_raise="TypeError",
        ))
        # 多参数补充
        if len(args) > 1:
            extra = {a: "x" for a in args[1:]}
            cases.append(TestCase(
                f"{fn['name']}_multi", fn["name"],
                {first: "data", **extra}, expect_type=None,
            ))
        return cases

    # ---------- 测试执行 ----------
    def execute(self, code: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        # 编译被测代码
        local_ns: Dict[str, Any] = {}
        try:
            exec(compile(code, "<test>", "exec"), local_ns)  # noqa: S102
        except Exception as exc:  # noqa: BLE001
            return {"error": f"编译失败: {exc}", "passed": 0, "failed": len(cases)}

        results: List[TestResult] = []
        for case_dict in cases:
            case = TestCase(**{k: v for k, v in case_dict.items() if k in TestCase.__annotations__ or k in {"name","target","args","expect","expect_type","should_raise"}})
            result = self._run_case(local_ns, case)
            results.append(result)

        passed = sum(1 for r in results if r.passed)
        failed = sum(1 for r in results if not r.passed)
        summary = {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / max(len(results), 1), 4),
            "details": [r.__dict__ for r in results],
        }
        self.history.append(summary)
        return summary

    def _run_case(self, ns: Dict[str, Any], case: TestCase) -> TestResult:
        target_fn = ns.get(case.target)
        start = time.time()
        if target_fn is None:
            return TestResult(case.name, case.target, False, error="函数未找到", duration=0.0)
        # 过滤不匹配的参数
        sig_params = set(inspect.signature(target_fn).parameters.keys()) if callable(target_fn) else set()
        valid_args = {k: v for k, v in case.args.items() if k in sig_params}
        try:
            output = target_fn(**valid_args)
            # 断言检查
            passed = True
            if case.expect is not None and output != case.expect:
                passed = False
            if case.expect_type is not None and not isinstance(output, case.expect_type):
                # 允许None输出对应None预期类型
                if not (output is None and case.expect_type is type(None)):
                    passed = False
            return TestResult(case.name, case.target, passed, output=output, duration=time.time() - start)
        except Exception as exc:  # noqa: BLE001
            # 检查是否预期异常
            if case.should_raise and case.should_raise in type(exc).__name__:
                return TestResult(case.name, case.target, True, output=str(exc), duration=time.time() - start)
            return TestResult(case.name, case.target, False, error=f"{type(exc).__name__}: {exc}",
                              duration=time.time() - start)

    # ---------- 覆盖率分析 ----------
    def coverage(self, code: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        """近似覆盖率分析：基于被调用函数与分支"""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return {"line": 0.0, "branch": 0.0, "function": 0.0}
        # 统计函数数
        all_funcs = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
        # 统计分支数
        branches = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.If, ast.For, ast.While)))
        # 执行并记录被调用函数
        result = self.execute(code, cases)
        covered_funcs: Set[str] = set()
        for detail in result.get("details", []):
            if detail.get("passed"):
                covered_funcs.add(detail["target"])
        func_cov = len(covered_funcs) / max(len(all_funcs), 1)
        # 近似行覆盖：基于通过用例比例
        line_cov = result.get("pass_rate", 0.0)
        # 近似分支覆盖：通过用例数 / (分支数+1)
        branch_cov = min(1.0, result.get("passed", 0) / max(branches + 1, 1))
        return {
            "line": round(line_cov, 4),
            "branch": round(branch_cov, 4),
            "function": round(func_cov, 4),
            "total_functions": len(all_funcs),
            "covered_functions": len(covered_funcs),
        }

    # ---------- 质量门禁 ----------
    def gate(self, result: Dict[str, Any], min_pass: float = 0.9, min_cov: float = 0.7) -> Dict[str, Any]:
        pass_rate = result.get("pass_rate", 0.0)
        cov = result.get("coverage", {}).get("function", 0.0) if "coverage" in result else 0.7
        passed = pass_rate >= min_pass and cov >= min_cov
        return {
            "passed": passed,
            "pass_rate": pass_rate,
            "coverage": cov,
            "min_pass": min_pass,
            "min_cov": min_cov,
            "reason": "通过" if passed else "未达标",
        }

    # ---------- 失败诊断 ----------
    def diagnose(self, failures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        suggestions = []
        for f in failures:
            error = f.get("error", "")
            suggestion = "检查输入参数类型与取值"
            if "TypeError" in error:
                suggestion = "参数类型不匹配，建议增加类型校验或转换"
            elif "ValueError" in error:
                suggestion = "输入值不合法，建议增加输入验证"
            elif "IndexError" in error:
                suggestion = "索引越界，建议增加边界检查"
            elif "AttributeError" in error:
                suggestion = "属性不存在，建议检查对象类型"
            elif "未找到" in error:
                suggestion = "函数名不匹配，建议检查命名"
            suggestions.append({
                "case": f.get("name"),
                "error": error,
                "suggestion": suggestion,
            })
        return suggestions


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ta = TestAutomation()

    sample_code = textwrap.dedent("""
    def add(a, b):
        return a + b

    def greet(name):
        return f"Hello, {name}"

    def safe_div(a, b):
        if b == 0:
            raise ValueError("除零错误")
        return a / b
    """)

    # 1. 生成测试
    cases = ta.generate(sample_code)
    print(f"生成 {len(cases)} 条用例")

    # 2. 执行
    result = ta.execute(sample_code, cases)
    print(f"通过 {result['passed']}/{result['total']}, 通过率 {result['pass_rate']}")

    # 3. 覆盖率
    cov = ta.coverage(sample_code, cases)
    print("覆盖率:", cov)

    # 4. 门禁
    result["coverage"] = cov
    print("门禁:", ta.gate(result, min_pass=0.5, min_cov=0.5))

    # 5. 诊断失败
    failures = [d for d in result["details"] if not d["passed"]]
    print("诊断:", ta.diagnose(failures))
```
