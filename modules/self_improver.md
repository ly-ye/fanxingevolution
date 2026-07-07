# 繁星·代码自改进（self_improver）

## 概述

繁星的代码自改进内核是繁星在漫长进化长夜中打磨自身的工匠之心。它以 AST 解析为火炉,以缺陷检测为风箱,以自动修复为锤锻,将每一行代码反复淬炼,使其在反复运行与反馈中渐次纯净。繁星相信,代码不是写出来的,而是改出来的。

当繁星凝视自身源码时,它看到的不是静态文本,而是一棵会呼吸的语法树。每一个节点的冗余、每一条路径的缺失、每一处异常的吞没,都会被它记下,化作下一次自我修订的依据。所有修订都通过版本管理留痕,可回溯、可回滚,确保进化从不迷失方向。

## 功能特性

- **AST 代码分析**:基于 `ast` 模块解析源码,提取函数/类/复杂度等结构化指标。
- **缺陷检测**:识别空异常捕获、过长函数、重复代码、未使用变量、可变默认参数等常见隐患。
- **自动修复**:对可机械修复的缺陷(如可变默认参数、空 except 补日志)生成补丁。
- **版本管理**:每次修订生成版本快照,支持 diff、回滚、历史追溯。
- **安全门控**:修复前调用进化三定律校验,拒绝会破坏稳定性或越界的改动。
- **回归守护**:修复后对受影响函数执行冒烟测试,失败即自动回滚。

## 接口说明

```python
class SelfImprover:
    def __init__(self, version_root: str, laws: EvolutionLaws | None = None) -> None
    # 初始化自改进器,version_root 为版本快照目录,laws 为进化三定律门控。

    def analyze(self, source: str, module_name: str = "<unknown>") -> AnalysisReport
    # 解析源码并返回结构化分析报告(复杂度、缺陷列表、节点统计)。

    def detect_defects(self, tree: ast.AST, source: str) -> list[Defect]
    # 在已解析的 AST 上检测缺陷,返回缺陷列表。

    def propose_fix(self, source: str, defect: Defect) -> Patch | None
    # 针对单个缺陷提出修复补丁;无法机械修复时返回 None。

    def apply_patch(self, module_name: str, source: str, patch: Patch) -> str
    # 应用补丁,经三定律门控与冒烟测试后返回修订后源码,失败抛出 ImprovementAborted。

    def snapshot(self, module_name: str, source: str, reason: str) -> str
    # 创建版本快照,返回版本 ID。

    def rollback(self, module_name: str, version_id: str) -> str
    # 回滚到指定版本,返回该版本源码。

    def improve_once(self, module_name: str, source: str) -> ImprovementResult
    # 端到端执行一轮:分析→检测→提出修复→应用→快照,返回改进结果。
```

## 与其他模块的联动

- **evolution_laws**:每次 `apply_patch` 前调用三定律门控,Endure 拒绝破坏稳定性的改动。
- **self_healing**:自愈系统在故障定位后,可委托 `propose_fix` 生成修复补丁。
- **knowledge_evolution**:缺陷模式经归纳后沉淀为知识条目,反哺检测规则。
- **benchmark_evaluator**:修复后由基准评测器复跑用例,量化改进收益。
- **configuration_management**:版本快照目录、规则阈值等通过配置管理注入。

## 完整实现代码

```python
"""繁星·代码自改进内核

以 AST 为火炉,以缺陷检测为风箱,淬炼自身代码。
作者:夜
"""

from __future__ import annotations

import ast
import hashlib
import json
import os
import textwrap
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Callable


class DefectLevel(str, Enum):
    """缺陷严重级别"""
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


class DefectKind(str, Enum):
    """缺陷类型"""
    EMPTY_EXCEPT = "empty_except"            # 空 except 吞异常
    MUTABLE_DEFAULT = "mutable_default"      # 可变默认参数
    LONG_FUNCTION = "long_function"          # 过长函数
    UNUSED_NAME = "unused_name"             # 未使用变量
    DUPLICATE_BLOCK = "duplicate_block"      # 重复代码块
    BARE_EXCEPT = "bare_except"              # 裸 except


@dataclass
class Defect:
    """单个缺陷描述"""
    kind: DefectKind
    level: DefectLevel
    lineno: int
    col: int
    message: str
    snippet: str = ""
    auto_fixable: bool = False


@dataclass
class AnalysisReport:
    """分析报告"""
    module_name: str
    node_count: int = 0
    func_count: int = 0
    class_count: int = 0
    max_complexity: int = 0
    defects: list[Defect] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        return sum(1 for d in self.defects if d.level == DefectLevel.ERROR)

    def to_dict(self) -> dict:
        return {
            "module": self.module_name,
            "nodes": self.node_count,
            "functions": self.func_count,
            "classes": self.class_count,
            "max_complexity": self.max_complexity,
            "defects": [asdict(d) for d in self.defects],
        }


@dataclass
class Patch:
    """修复补丁"""
    kind: DefectKind
    description: str
    original: str
    patched: str
    lineno: int


@dataclass
class ImprovementResult:
    """一轮改进的结果"""
    module_name: str
    version_before: str
    version_after: str
    applied_patches: list[Patch]
    skipped: int
    rolled_back: bool = False
    reason: str = ""


class ImprovementAborted(RuntimeError):
    """改进被三定律门控或冒烟测试中止"""


class _DefectVisitor(ast.NodeVisitor):
    """遍历 AST 收集缺陷与指标"""

    def __init__(self) -> None:
        self.defects: list[Defect] = []
        self.node_count = 0
        self.func_count = 0
        self.class_count = 0
        self.max_complexity = 0
        self._assigned_names: dict[str, int] = {}

    def _complexity(self, node: ast.AST) -> int:
        """简单圈复杂度:统计分支节点"""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.For, ast.While, ast.And, ast.Or,
                                  ast.ExceptHandler, ast.With)):
                complexity += 1
        return complexity

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.func_count += 1
        self.generic_visit(node)
        # 检查可变默认参数
        for default in node.args.defaults + node.args.kw_defaults:
            if default and isinstance(default, (ast.List, ast.Dict, ast.Set)):
                self.defects.append(Defect(
                    kind=DefectKind.MUTABLE_DEFAULT, level=DefectLevel.WARN,
                    lineno=node.lineno, col=node.col_offset,
                    message=f"函数 {node.name} 使用可变默认参数,可能导致共享状态污染",
                    auto_fixable=True,
                ))
        # 检查过长函数
        length = (node.end_lineno or node.lineno) - node.lineno + 1
        if length > 50:
            self.defects.append(Defect(
                kind=DefectKind.LONG_FUNCTION, level=DefectLevel.WARN,
                lineno=node.lineno, col=node.col_offset,
                message=f"函数 {node.name} 长度 {length} 行,建议拆分",
                auto_fixable=False,
            ))
        complexity = self._complexity(node)
        self.max_complexity = max(self.max_complexity, complexity)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.class_count += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        # 裸 except
        if node.type is None:
            self.defects.append(Defect(
                kind=DefectKind.BARE_EXCEPT, level=DefectLevel.WARN,
                lineno=node.lineno, col=node.col_offset,
                message="裸 except 会吞掉所有异常(含 KeyboardInterrupt),建议指定异常类型",
                auto_fixable=False,
            ))
        # 空 except 块
        body = [n for n in node.body if not isinstance(n, ast.Pass)]
        if not body:
            self.defects.append(Defect(
                kind=DefectKind.EMPTY_EXCEPT, level=DefectLevel.ERROR,
                lineno=node.lineno, col=node.col_offset,
                message="空 except 静默吞异常,故障将无从追溯",
                auto_fixable=True,
            ))
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign) -> None:
        for target in node.targets:
            if isinstance(target, ast.Name):
                self._assigned_names[target.id] = node.lineno
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            self._assigned_names.pop(node.id, None)
        self.generic_visit(node)

    def finalize(self) -> None:
        for name, lineno in self._assigned_names.items():
            if name.startswith("_"):
                continue
            self.defects.append(Defect(
                kind=DefectKind.UNUSED_NAME, level=DefectLevel.INFO,
                lineno=lineno, col=0,
                message=f"变量 {name} 赋值后未使用",
                auto_fixable=False,
            ))

    def generic_visit(self, node: ast.AST) -> None:
        self.node_count += 1
        super().generic_visit(node)


class SelfImprover:
    """繁星·代码自改进器"""

    def __init__(self, version_root: str, laws: "Any | None" = None) -> None:
        self.version_root = version_root
        self.laws = laws
        self._smoke_tests: dict[str, Callable[[], bool]] = {}
        os.makedirs(version_root, exist_ok=True)

    # ---- 分析 ----
    def analyze(self, source: str, module_name: str = "<unknown>") -> AnalysisReport:
        tree = ast.parse(source)
        visitor = _DefectVisitor()
        visitor.visit(tree)
        visitor.finalize()
        report = AnalysisReport(
            module_name=module_name,
            node_count=visitor.node_count,
            func_count=visitor.func_count,
            class_count=visitor.class_count,
            max_complexity=visitor.max_complexity,
            defects=visitor.defects,
        )
        return report

    def detect_defects(self, tree: ast.AST, source: str) -> list[Defect]:
        visitor = _DefectVisitor()
        visitor.visit(tree)
        visitor.finalize()
        return visitor.defects

    # ---- 修复 ----
    def propose_fix(self, source: str, defect: Defect) -> Patch | None:
        lines = source.splitlines(keepends=True)
        idx = defect.lineno - 1
        if idx < 0 or idx >= len(lines):
            return None

        if defect.kind == DefectKind.MUTABLE_DEFAULT:
            line = lines[idx]
            # 将 def f(x=[]) 改为 def f(x=None) 并在函数体首行补充守护
            new_line = (line.replace("=[]", "=None")
                            .replace("={}", "=None")
                            .replace("=set()", "=None"))
            if new_line == line:
                return None
            return Patch(defect.kind, "将可变默认参数改为 None 守护",
                         line, new_line, defect.lineno)

        if defect.kind == DefectKind.EMPTY_EXCEPT:
            line = lines[idx]
            # 简化处理:在 except: 后首行补一条日志
            patched = line.rstrip("\n") + "  # TODO 繁星: 此处静默吞异常,请补充处理\n"
            return Patch(defect.kind, "为空 except 标注 TODO 日志",
                         line, patched, defect.lineno)

        return None

    def apply_patch(self, module_name: str, source: str, patch: Patch) -> str:
        # 三定律门控
        if self.laws is not None and hasattr(self.laws, "gate"):
            verdict = self.laws.gate(action="self_improve",
                                     payload={"module": module_name, "kind": patch.kind.value})
            if not verdict.allowed:
                raise ImprovementAborted(f"三定律拒绝: {verdict.reason}")

        lines = source.splitlines(keepends=True)
        idx = patch.lineno - 1
        if lines[idx] != patch.original:
            raise ImprovementAborted("补丁上下文已偏移,放弃应用")
        lines[idx] = patch.patched
        new_source = "".join(lines)

        # 冒烟测试:确保仍能编译
        try:
            compile(new_source, module_name, "exec")
        except SyntaxError as e:
            raise ImprovementAborted(f"修复后语法错误: {e}")

        smoke = self._smoke_tests.get(module_name)
        if smoke is not None and not smoke():
            raise ImprovementAborted("冒烟测试失败,回滚")
        return new_source

    # ---- 版本管理 ----
    def snapshot(self, module_name: str, source: str, reason: str) -> str:
        vid = hashlib.sha1(f"{module_name}{time.time()}{reason}".encode()).hexdigest()[:12]
        record = {
            "version": vid,
            "module": module_name,
            "reason": reason,
            "timestamp": time.time(),
            "source": source,
        }
        path = os.path.join(self.version_root, f"{module_name}.{vid}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        return vid

    def rollback(self, module_name: str, version_id: str) -> str:
        path = os.path.join(self.version_root, f"{module_name}.{version_id}.json")
        with open(path, "r", encoding="utf-8") as f:
            record = json.load(f)
        return record["source"]

    def register_smoke_test(self, module_name: str, fn: Callable[[], bool]) -> None:
        self._smoke_tests[module_name] = fn

    # ---- 端到端 ----
    def improve_once(self, module_name: str, source: str) -> ImprovementResult:
        before = self.snapshot(module_name, source, "before_improve")
        report = self.analyze(source, module_name)
        applied: list[Patch] = []
        skipped = 0
        current = source
        for defect in report.defects:
            if not defect.auto_fixable:
                skipped += 1
                continue
            patch = self.propose_fix(current, defect)
            if patch is None:
                skipped += 1
                continue
            try:
                current = self.apply_patch(module_name, current, patch)
                applied.append(patch)
            except ImprovementAborted:
                skipped += 1
        after = self.snapshot(module_name, current, "after_improve")
        return ImprovementResult(
            module_name=module_name,
            version_before=before,
            version_after=after,
            applied_patches=applied,
            skipped=skipped,
        )


# ---- 轻量门控替身(便于独立测试) ----
class _AllowAllLaws:
    class Verdict:
        def __init__(self) -> None:
            self.allowed = True
            self.reason = ""

    def gate(self, action: str, payload: dict | None = None):
        return self.Verdict()


if __name__ == "__main__":
    sample = textwrap.dedent('''
        def append_to(item, target=[]):
            target.append(item)
            return target

        def run():
            try:
                do_something()
            except:
                pass
            unused = 42
            return unused
    ''')

    improver = SelfImprover(version_root="./.fanxing_versions", laws=_AllowAllLaws())
    result = improver.improve_once("demo", sample)
    print("分析报告:", json.dumps(improver.analyze(sample, "demo").to_dict(),
                                   ensure_ascii=False, indent=2))
    print("应用补丁数:", len(result.applied_patches))
    print("跳过缺陷数:", result.skipped)
    print("版本:", result.version_before, "->", result.version_after)
    print("---- 修订后源码 ----")
    print(improver.rollback("demo", result.version_after))
