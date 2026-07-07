# 繁星·代码生成（code_generation）

## 概述

繁星的代码生成整合自代码生成与自动文档，是繁星将意图凝结为可执行文本的造物之手。它不仅根据自然语言与模板产出代码，更会从 AST 层面理解既有代码，自动生成 API 文档与变更日志，让代码的每一次进化都留下清晰可读的注脚。

繁星深知，代码不只是写给机器的指令，更是写给人读的故事。因此代码生成在产出后还会进行质量评估与重构建议，确保新生成的代码既正确又优雅。

## 功能特性

- **代码模板**：基于参数化模板快速生成常见结构（函数、类、API端点等）。
- **代码优化**：对生成代码进行静态分析与简化建议。
- **质量评估**：从复杂度、可读性、安全性等维度评分。
- **重构建议**：识别长函数、重复块、深层嵌套并给出重构方案。
- **AST 解析**：解析 Python 源码为抽象语法树，提取结构信息。
- **API 文档生成**：从函数签名与 docstring 自动生成 API 文档。
- **变更日志**：对比新旧代码版本，生成结构化变更记录。

## 接口说明

```python
class CodeGenerator:
    def __init__(self, templates: Optional[Dict[str, str]] = None) -> None
    # 初始化代码生成器，可传入自定义模板

    def render(self, template_name: str, params: Dict[str, Any]) -> str
    # 参数：template_name 模板名；params 渲染参数
    # 返回：渲染后的代码字符串

    def assess(self, code: str) -> Dict[str, Any]
    # 参数：code 待评估代码
    # 返回：包含复杂度、可读性、安全分、总分的字典

    def refactor_suggest(self, code: str) -> List[Dict[str, Any]]
    # 参数：code 待分析代码
    # 返回：重构建议列表

    def parse_ast(self, code: str) -> Dict[str, Any]
    # 参数：code Python源码
    # 返回：AST结构摘要（函数、类、导入等）

    def gen_api_doc(self, code: str) -> Dict[str, Any]
    # 参数：code 含函数/类定义的源码
    # 返回：API文档结构

    def gen_changelog(self, old_code: str, new_code: str) -> Dict[str, Any]
    # 参数：old_code 旧版本；new_code 新版本
    # 返回：变更日志
```

## 与其他模块的联动

- 与 **tool_creator** 联动：工具创造器调用代码生成产出工具源码。
- 与 **test_automation** 联动：生成代码后自动触发测试生成与质量门禁。
- 与 **diagnostics** 联动：质量评估结果上报诊断系统用于趋势分析。
- 与 **knowledge_distillation** 联动：重构经验被蒸馏为可复用规则。

## 完整实现代码

```python
"""
繁星·代码生成模块
整合自代码生成与自动文档：模板渲染、质量评估、重构建议、AST解析、API文档、变更日志
创作者：夜
"""
from __future__ import annotations

import ast
import difflib
import re
import textwrap
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ---------- 默认模板 ----------
DEFAULT_TEMPLATES = {
    "function": (
        "def {name}({params}){return_type}:\n"
        '    """{docstring}"""\n'
        "    {body}\n"
    ),
    "class": (
        "class {name}{bases}:\n"
        '    """{docstring}"""\n\n'
        "    def __init__(self{init_params}):\n"
        "        {init_body}\n"
    ),
    "api_endpoint": (
        "@app.{method}(\"{path}\")\n"
        "def {name}({params}):\n"
        '    """{docstring}"""\n'
        "    {body}\n"
        "    return {response}\n"
    ),
}


@dataclass
class RefactorSuggestion:
    """重构建议"""
    kind: str  # long_function / duplicate / deep_nesting / unused
    message: str
    line: int
    severity: str = "info"  # info / warn / error


class CodeGenerator:
    """繁星代码生成器"""

    def __init__(self, templates: Optional[Dict[str, str]] = None) -> None:
        self.templates = {**DEFAULT_TEMPLATES, **(templates or {})}

    # ---------- 模板渲染 ----------
    def render(self, template_name: str, params: Dict[str, Any]) -> str:
        tpl = self.templates.get(template_name)
        if tpl is None:
            raise KeyError(f"未知模板: {template_name}")
        try:
            return tpl.format(**params)
        except KeyError as exc:
            raise ValueError(f"模板缺少参数: {exc}") from exc

    # ---------- 质量评估 ----------
    def assess(self, code: str) -> Dict[str, Any]:
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return {"error": str(exc), "total": 0.0}

        complexity = self._cyclomatic_complexity(tree)
        lines = len([l for l in code.splitlines() if l.strip()])
        # 可读性：越短越简单越可读
        readability = max(0.0, min(1.0, 1.0 - (complexity / max(lines, 1)) * 0.5))
        # 安全性：简单检查危险调用
        danger = len(re.findall(r"\beval\b|\bexec\b|\bos\.system\b", code))
        security = max(0.0, 1.0 - danger * 0.2)
        total = round((readability * 0.4 + security * 0.4 + (1 - min(complexity / 20, 1)) * 0.2) * 100, 2)
        return {
            "complexity": complexity,
            "lines": lines,
            "readability": round(readability, 4),
            "security": round(security, 4),
            "total": total,
        }

    def _cyclomatic_complexity(self, tree: ast.AST) -> int:
        """近似圈复杂度"""
        complexity = 1
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.For, ast.While, ast.ExceptHandler)):
                complexity += 1
            elif isinstance(node, ast.BoolOp):
                complexity += len(node.values) - 1
        return complexity

    # ---------- 重构建议 ----------
    def refactor_suggest(self, code: str) -> List[Dict[str, Any]]:
        suggestions: List[RefactorSuggestion] = []
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return [{"kind": "syntax_error", "message": str(exc), "line": 0, "severity": "error"}]

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                # 长函数检测
                length = node.end_lineno - node.lineno if hasattr(node, "end_lineno") else 0
                if length > 30:
                    suggestions.append(RefactorSuggestion(
                        "long_function", f"函数 {node.name} 长度 {length} 行，建议拆分",
                        node.lineno, "warn",
                    ))
                # 深层嵌套检测
                depth = self._nesting_depth(node)
                if depth > 4:
                    suggestions.append(RefactorSuggestion(
                        "deep_nesting", f"函数 {node.name} 嵌套深度 {depth}，建议提取子函数",
                        node.lineno, "warn",
                    ))
        # 简单重复块检测
        lines = code.splitlines()
        seen: Dict[str, int] = {}
        for i, line in enumerate(lines):
            key = line.strip()
            if len(key) > 10 and key in seen:
                suggestions.append(RefactorSuggestion(
                    "duplicate", f"疑似重复行: {key[:30]}", i + 1, "info",
                ))
            else:
                seen[key] = i
        return [s.__dict__ for s in suggestions]

    def _nesting_depth(self, node: ast.AST, current: int = 0) -> int:
        max_depth = current
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.If, ast.For, ast.While, ast.With, ast.Try)):
                max_depth = max(max_depth, self._nesting_depth(child, current + 1))
            else:
                max_depth = max(max_depth, self._nesting_depth(child, current))
        return max_depth

    # ---------- AST 解析 ----------
    def parse_ast(self, code: str) -> Dict[str, Any]:
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return {"error": str(exc)}
        funcs, classes, imports = [], [], []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                funcs.append({
                    "name": node.name,
                    "line": node.lineno,
                    "args": [a.arg for a in node.args.args],
                    "docstring": ast.get_docstring(node) or "",
                })
            elif isinstance(node, ast.ClassDef):
                methods = [n.name for n in node.body if isinstance(n, ast.FunctionDef)]
                classes.append({
                    "name": node.name,
                    "line": node.lineno,
                    "methods": methods,
                    "docstring": ast.get_docstring(node) or "",
                })
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                imports.append(ast.dump(node))
        return {"functions": funcs, "classes": classes, "imports": imports}

    # ---------- API 文档生成 ----------
    def gen_api_doc(self, code: str) -> Dict[str, Any]:
        ast_info = self.parse_ast(code)
        if "error" in ast_info:
            return ast_info
        docs = []
        for fn in ast_info["functions"]:
            docs.append({
                "name": fn["name"],
                "signature": f"{fn['name']}({', '.join(fn['args'])})",
                "description": fn["docstring"],
            })
        for cls in ast_info["classes"]:
            docs.append({
                "name": cls["name"],
                "type": "class",
                "methods": cls["methods"],
                "description": cls["docstring"],
            })
        return {"api": docs, "count": len(docs)}

    # ---------- 变更日志 ----------
    def gen_changelog(self, old_code: str, new_code: str) -> Dict[str, Any]:
        old_funcs = {f["name"]: f for f in self.parse_ast(old_code).get("functions", [])}
        new_funcs = {f["name"]: f for f in self.parse_ast(new_code).get("functions", [])}

        added = [n for n in new_funcs if n not in old_funcs]
        removed = [n for n in old_funcs if n not in new_funcs]
        modified = []
        for name in old_funcs:
            if name in new_funcs and old_funcs[name]["args"] != new_funcs[name]["args"]:
                modified.append({
                    "name": name,
                    "old_args": old_funcs[name]["args"],
                    "new_args": new_funcs[name]["args"],
                })
        # 行级diff摘要
        diff = list(difflib.unified_diff(
            old_code.splitlines(), new_code.splitlines(), lineterm=""
        ))
        return {
            "added": added,
            "removed": removed,
            "modified": modified,
            "diff_lines": len(diff),
            "diff_preview": diff[:20],
        }


# ---------- 简单测试 ----------
if __name__ == "__main__":
    gen = CodeGenerator()

    # 1. 模板渲染
    code = gen.render("function", {
        "name": "greet", "params": "name", "return_type": " -> str",
        "docstring": "问候", "body": "return f'Hello, {name}'",
    })
    print(code)

    # 2. 质量评估
    sample = textwrap.dedent("""
    def complex_fn(x, y):
        if x > 0:
            for i in range(y):
                if i % 2:
                    print(i)
        return x
    """)
    print("评估:", gen.assess(sample))

    # 3. 重构建议
    print("建议:", gen.refactor_suggest(sample))

    # 4. AST解析与API文档
    print("API文档:", gen.gen_api_doc(sample))

    # 5. 变更日志
    old = "def f(a):\n    return a\n"
    new = "def f(a, b):\n    return a + b\n"
    print("变更:", gen.gen_changelog(old, new))
```
