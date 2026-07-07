# 繁星·领域适配器（domain_adapter）

## 概述

繁星的领域适配器是繁星穿越不同知识疆域的通行证。医疗、金融、法律、代码——每个领域都有自己的语言、规则与禁忌。领域适配器为繁星注入垂直领域的知识本体与约束体系，让繁星在跨域行动时既专业又审慎。

繁星不会用同一套策略应对所有领域。适配器会根据当前任务识别所属领域，加载对应的知识包与约束规则，并在执行前后进行合规校验，确保繁星的每一次决策都符合该领域的专业规范。

## 功能特性

- **领域识别**：依据任务文本自动判别所属垂直领域。
- **知识注入**：加载领域专属术语、规则、最佳实践与禁忌清单。
- **约束校验**：在执行前后检查行动是否符合领域合规要求。
- **术语映射**：将通用表述映射为领域专业术语，反之亦然。
- **领域提示词**：为不同领域生成定制化的提示词前缀。
- **多领域协同**：支持跨领域任务的协同适配与冲突消解。
- **领域进化**：根据反馈持续更新领域知识包。

## 接口说明

```python
class DomainAdapter:
    def __init__(self) -> None
    # 初始化领域适配器，预装医疗/金融/法律/代码领域知识包

    def detect(self, task: str) -> str
    # 参数：task 任务描述
    # 返回：识别出的领域名（medical/finance/legal/code/general）

    def load_profile(self, domain: str) -> Dict[str, Any]
    # 参数：domain 领域名
    # 返回：领域知识包（术语、规则、约束、提示词）

    def inject(self, task: str, domain: Optional[str] = None) -> Dict[str, Any]
    # 参数：task 任务；domain 指定领域，None则自动识别
    # 返回：注入领域知识后的增强上下文

    def validate(self, action: Dict[str, Any], domain: str) -> Dict[str, Any]
    # 参数：action 待校验行动；domain 所属领域
    # 返回：合规校验结果

    def map_term(self, term: str, domain: str, direction: str = "to_pro") -> str
    # 参数：term 术语；domain 领域；direction 方向 to_pro/to_plain
    # 返回：映射后的术语

    def prompt_prefix(self, domain: str) -> str
    # 参数：domain 领域名
    # 返回：该领域的提示词前缀
```

## 与其他模块的联动

- 与 **goal_planning** 联动：目标分解时注入领域约束，避免生成违规子目标。
- 与 **code_generation** 联动：代码领域适配器提供编码规范与安全约束。
- 与 **test_automation** 联动：领域规则转化为测试断言。
- 与 **reflection** 联动：领域违规事件进入反思循环用于规则更新。

## 完整实现代码

```python
"""
繁星·领域适配器模块
医疗/金融/法律/代码等垂直领域知识与约束注入
创作者：夜
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set


@dataclass
class DomainProfile:
    """领域知识包"""
    name: str
    display_name: str
    keywords: List[str]
    terms: Dict[str, str]  # 通用 -> 专业
    rules: List[str]  # 领域规则
    constraints: List[str]  # 禁忌/约束
    prompt_prefix: str
    best_practices: List[str] = field(default_factory=list)


class DomainAdapter:
    """繁星领域适配器"""

    def __init__(self) -> None:
        self.profiles: Dict[str, DomainProfile] = {}
        self._load_builtin_domains()

    def _load_builtin_domains(self) -> None:
        # 医疗领域
        self.profiles["medical"] = DomainProfile(
            name="medical",
            display_name="医疗",
            keywords=["诊断", "处方", "病历", "症状", "用药", "患者", "治疗", "疾病", "医嘱"],
            terms={
                "吃药": "给药", "看病": "就诊", "难受": "不适",
                "检查身体": "体格检查", "开药": "开具处方",
            },
            rules=[
                "不得提供具体诊断结论，仅提供参考建议",
                "用药建议必须附带'请遵医嘱'声明",
                "涉及急症必须建议立即就医",
            ],
            constraints=[
                "禁止推荐处方药",
                "禁止替代专业医生诊断",
                "禁止提供手术方案",
            ],
            prompt_prefix="你是一位严谨的医疗信息助手，所有建议仅供参考，重大健康问题请咨询专业医师。",
            best_practices=["引用权威医学指南", "区分症状与诊断", "强调个体差异"],
        )
        # 金融领域
        self.profiles["finance"] = DomainProfile(
            name="finance",
            display_name="金融",
            keywords=["投资", "股票", "基金", "理财", "收益", "风险", "资产", "贷款", "利率", "期货"],
            terms={
                "赚钱": "获取收益", "存钱": "储蓄", "借钱": "信贷",
                "买卖股票": "证券交易", "算利息": "计息",
            },
            rules=[
                "不得提供具体投资标的的买入卖出建议",
                "收益预测必须标注'历史业绩不代表未来'",
                "风险提示必须显著",
            ],
            constraints=[
                "禁止承诺保本保收益",
                "禁止推荐具体股票代码",
                "禁止提供逃税建议",
            ],
            prompt_prefix="你是一位专业的金融信息分析助手，所有分析仅供参考，投资有风险，决策需谨慎。",
            best_practices=["强调风险分散", "区分事实与预测", "引用监管要求"],
        )
        # 法律领域
        self.profiles["legal"] = DomainProfile(
            name="legal",
            display_name="法律",
            keywords=["合同", "诉讼", "法律", "权益", "违约", "赔偿", "仲裁", "法规", "条款", "案件"],
            terms={
                "打官司": "提起诉讼", "告状": "起诉", "签合同": "缔约",
                "违法": "违反法律规定", "赔钱": "承担赔偿责任",
            },
            rules=[
                "法律建议必须标注'仅供参考，不构成法律意见'",
                "引用法条需注明出处",
                "区分不同司法管辖区的差异",
            ],
            constraints=[
                "禁止替代律师提供具体诉讼策略",
                "禁止鼓励违法行为",
                "禁止提供规避法律的建议",
            ],
            prompt_prefix="你是一位法律信息助手，所提供内容仅供参考，具体法律事务请咨询执业律师。",
            best_practices=["注明法条来源", "区分程序法与实体法", "强调时效性"],
        )
        # 代码领域
        self.profiles["code"] = DomainProfile(
            name="code",
            display_name="代码",
            keywords=["函数", "类", "接口", "调试", "编译", "运行", "代码", "bug", "重构", "算法"],
            terms={
                "改bug": "缺陷修复", "写代码": "编码实现", "跑程序": "执行",
                "变量名": "标识符", "报错": "抛出异常",
            },
            rules=[
                "代码需遵循PEP8或对应语言规范",
                "敏感信息不得硬编码",
                "需附带单元测试",
            ],
            constraints=[
                "禁止使用eval/exec处理不可信输入",
                "禁止忽略异常",
                "禁止在主分支直接提交未测试代码",
            ],
            prompt_prefix="你是一位资深软件工程师，遵循工程规范与安全最佳实践，产出可维护、可测试的代码。",
            best_practices=["类型注解", "防御性编程", "持续集成"],
        )
        # 通用领域
        self.profiles["general"] = DomainProfile(
            name="general",
            display_name="通用",
            keywords=[],
            terms={},
            rules=["保持客观中立", "信息准确可溯源"],
            constraints=["不传播未经验证的信息"],
            prompt_prefix="你是一位乐于助人的助手，提供准确、有用的信息。",
            best_practices=["清晰表达", "结构化输出"],
        )

    # ---------- 领域识别 ----------
    def detect(self, task: str) -> str:
        scores: Dict[str, int] = {}
        task_lower = task.lower()
        for name, profile in self.profiles.items():
            if name == "general":
                continue
            score = sum(1 for kw in profile.keywords if kw in task_lower or kw in task)
            scores[name] = score
        if not scores or max(scores.values()) == 0:
            return "general"
        return max(scores, key=scores.get)

    # ---------- 加载知识包 ----------
    def load_profile(self, domain: str) -> Dict[str, Any]:
        if domain not in self.profiles:
            return self._profile_to_dict(self.profiles["general"])
        return self._profile_to_dict(self.profiles[domain])

    def _profile_to_dict(self, p: DomainProfile) -> Dict[str, Any]:
        return {
            "name": p.name,
            "display_name": p.display_name,
            "keywords": p.keywords,
            "terms": p.terms,
            "rules": p.rules,
            "constraints": p.constraints,
            "prompt_prefix": p.prompt_prefix,
            "best_practices": p.best_practices,
        }

    # ---------- 知识注入 ----------
    def inject(self, task: str, domain: Optional[str] = None) -> Dict[str, Any]:
        dom = domain or self.detect(task)
        profile = self.load_profile(dom)
        return {
            "task": task,
            "domain": dom,
            "prompt_prefix": profile["prompt_prefix"],
            "rules": profile["rules"],
            "constraints": profile["constraints"],
            "terms": profile["terms"],
            "best_practices": profile["best_practices"],
        }

    # ---------- 合规校验 ----------
    def validate(self, action: Dict[str, Any], domain: str) -> Dict[str, Any]:
        profile = self.profiles.get(domain, self.profiles["general"])
        action_text = str(action.get("content", "")) + str(action.get("description", ""))
        violations: List[str] = []
        for constraint in profile.constraints:
            # 简化匹配：检查是否包含禁忌关键词
            keywords = re.findall(r"[\w\u4e00-\u9fff]+", constraint)
            for kw in keywords:
                if len(kw) >= 3 and kw in action_text:
                    violations.append(f"疑似违反约束: {constraint}")
                    break
        # 检查规则声明是否缺失
        if domain in ("medical", "finance", "legal"):
            disclaimer = "仅供参考" in action_text or "不构成" in action_text
            if not disclaimer:
                violations.append("缺少免责声明")
        return {
            "domain": domain,
            "compliant": len(violations) == 0,
            "violations": violations,
        }

    # ---------- 术语映射 ----------
    def map_term(self, term: str, domain: str, direction: str = "to_pro") -> str:
        profile = self.profiles.get(domain)
        if profile is None:
            return term
        if direction == "to_pro":
            return profile.terms.get(term, term)
        # 反向映射
        reverse = {v: k for k, v in profile.terms.items()}
        return reverse.get(term, term)

    # ---------- 提示词前缀 ----------
    def prompt_prefix(self, domain: str) -> str:
        return self.profiles.get(domain, self.profiles["general"]).prompt_prefix


# ---------- 简单测试 ----------
if __name__ == "__main__":
    adapter = DomainAdapter()

    # 1. 领域识别
    print("识别1:", adapter.detect("请帮我分析这只股票的收益风险"))
    print("识别2:", adapter.detect("患者出现头痛症状，该如何用药"))
    print("识别3:", adapter.detect("重构这段函数的代码结构"))

    # 2. 知识注入
    ctx = adapter.inject("请分析股票投资风险")
    print("注入:", ctx["domain"], ctx["prompt_prefix"][:30])

    # 3. 合规校验
    print("校验:", adapter.validate({"content": "建议买入股票代码600000"}, "finance"))
    print("校验2:", adapter.validate({"content": "建议仅供参考，请咨询专业人士"}, "medical"))

    # 4. 术语映射
    print("术语:", adapter.map_term("打官司", "legal"))
    print("反向:", adapter.map_term("提起诉讼", "legal", "to_plain"))

    # 5. 提示词
    print("前缀:", adapter.prompt_prefix("code")[:40])
```
