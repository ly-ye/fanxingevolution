# 繁星·提示工程（prompt_engineering）

## 概述

繁星的提示工程系统是它雕琢"如何向语言模型发问"的工坊，整合自提示工程与提示自优化器。在繁星的进化体系中，同样的思考能力配上不同提示词，效果天差地别，因此繁星把提示词当作可进化的"基因"，用生成、优化、评估、A/B 测试与进化算法不断打磨。

提示工程整合了三层能力：生成器按任务类型套用模板产出初版提示，优化器先用文本梯度做局部微扰寻优、再用进化算法做全局选择变异，评估器从清晰度、具体性、完整性、简洁性四维打分。三者闭环，让繁星的提示词在多代演化中持续趋近最优。

## 功能特性

- **提示生成**：按任务类型（qa/summarize/code/reasoning）套用模板，支持自定义模板。
- **文本梯度优化**：对模板施加多种编辑算子，选择提升最大的方向作为局部优化。
- **进化算法优化**：种群选择→变异→评估，迭代多代，保留精英并记录演化谱系。
- **多维评估**：清晰度、具体性、完整性、简洁性四指标加权打分。
- **A/B 测试**：对两版提示做多次评估，输出均值、胜者与提升幅度。
- **自动优化闭环**：`optimize` 一键串联文本梯度与进化算法，从初版到最优版。

## 接口说明

- `PromptEngineering()`：统一入口
- `generate(task_type, variables) -> Prompt`：按模板生成初版提示
- `optimize(prompt, generations=5) -> Prompt`：自动优化，返回最优提示
- `ab_test(prompt_a, prompt_b, sample_size=10) -> Dict`
  - 返回：`{mean_a, mean_b, winner, lift}`
- `PromptEvaluator.evaluate(template) -> float`：四维加权得分
- `PromptOptimizer.text_gradient(prompt, eval_fn, epsilon=0.05) -> str`
- `PromptOptimizer.evolve(population, eval_fn, generations, mutation_rate, population_size) -> Prompt`

## 与其他模块的联动

- 优化目标函数可由**元认知**的置信度或**辩论推理**的共识分充当，使提示优化服务于思考质量。
- 为**创造性思维**生成发散与组合的引导模板，激发更高质量的灵感。
- 为**学习策略**生成不同学习范式的元学习提示，加速任务适配。
- A/B 测试的胜出提示进入**推荐引擎**，向其他繁星实例推广。
- 评估指标可结合**因果推理**的因果链完整性，奖励可解释的提示结构。

## 完整实现代码

```python
"""繁星·提示工程模块（prompt_engineering）
整合自提示工程与提示自优化器，提供提示生成、优化、A/B 测试、评估
与基于进化算法的自动优化能力。
创作者：夜
"""
from __future__ import annotations
import math
import random
from typing import List, Dict, Tuple, Optional, Callable
from dataclasses import dataclass, field


@dataclass
class Prompt:
    """一条提示词：模板 + 变量 + 元信息。"""
    template: str
    variables: List[str] = field(default_factory=list)
    temperature: float = 0.7
    score: float = 0.0
    generation: int = 0
    lineage: str = ""   # 演化谱系


class PromptGenerator:
    """提示生成：根据任务类型与种子关键词产出候选模板。"""

    def __init__(self, templates: Optional[Dict[str, str]] = None):
        self.templates: Dict[str, str] = dict(templates) if templates else {
            "qa": "请回答以下问题：{question}\n要求：准确、简洁。",
            "summarize": "请总结以下文本：{text}\n要求：{length}字以内。",
            "code": "请用{language}实现：{task}\n要求：注释清晰。",
            "reasoning": "请逐步推理：{problem}\n要求：每步给出依据。",
        }

    def generate(self, task_type: str, variables: Dict[str, str]) -> Prompt:
        template = self.templates.get(task_type, "{input}")
        var_names = list(variables.keys())
        return Prompt(template=template, variables=var_names, temperature=0.7)

    def add_template(self, task_type: str, template: str) -> None:
        self.templates[task_type] = template


class PromptOptimizer:
    """提示优化：基于编辑、文本梯度与进化算法改进提示词。"""

    def __init__(self, seed: int = 11):
        random.seed(seed)
        # 编辑算子
        self.edit_ops: List[Callable[[str], str]] = [
            self._add_constraint,
            self._add_example,
            self._rephrase,
            self._add_step,
        ]

    @staticmethod
    def _add_constraint(text: str) -> str:
        constraints = ["请确保答案可验证。", "避免臆测。", "输出需结构化。", "优先简洁。"]
        return text + " " + random.choice(constraints)

    @staticmethod
    def _add_example(text: str) -> str:
        return text + "\n示例：输入 X -> 输出 Y。"

    @staticmethod
    def _rephrase(text: str) -> str:
        # 简单改写：句末追加同义引导
        return text.replace("请回答", "请解析").replace("请总结", "请概括")

    @staticmethod
    def _add_step(text: str) -> str:
        return text + "\n请按步骤1、2、3展开。"

    def text_gradient(self, prompt: Prompt, eval_fn: Callable[[str], float],
                      epsilon: float = 0.05) -> str:
        """文本梯度：对模板做若干微扰，选择提升最大的方向。"""
        base_score = eval_fn(prompt.template)
        best_text, best_delta = prompt.template, 0.0
        for op in self.edit_ops:
            mutated = op(prompt.template)
            score = eval_fn(mutated)
            delta = score - base_score
            if delta > best_delta:
                best_delta, best_text = delta, mutated
        # 若提升低于 epsilon，则保留原文
        return best_text if best_delta > epsilon else prompt.template

    def evolve(self, population: List[Prompt], eval_fn: Callable[[str], float],
               generations: int = 5, mutation_rate: float = 0.4,
               population_size: int = 8) -> Prompt:
        """进化算法：选择 -> 变异 -> 评估，迭代若干代。"""
        for p in population:
            p.score = eval_fn(p.template)
        for gen in range(generations):
            population.sort(key=lambda p: p.score, reverse=True)
            # 精英保留前一半
            survivors = population[: max(2, population_size // 2)]
            # 变异产生后代
            offspring: List[Prompt] = []
            while len(survivors) + len(offspring) < population_size:
                parent = random.choice(survivors)
                child_template = parent.template
                if random.random() < mutation_rate:
                    child_template = random.choice(self.edit_ops)(child_template)
                child = Prompt(
                    template=child_template,
                    variables=parent.variables,
                    temperature=parent.temperature,
                    generation=gen + 1,
                    lineage=parent.lineage + f"->g{gen+1}",
                )
                child.score = eval_fn(child.template)
                offspring.append(child)
            population = survivors + offspring
        population.sort(key=lambda p: p.score, reverse=True)
        return population[0]


class PromptEvaluator:
    """提示评估：基于多维度指标打分。"""

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or {"clarity": 0.3, "specificity": 0.3,
                                   "completeness": 0.2, "brevity": 0.2}

    def evaluate(self, template: str) -> float:
        clarity = self._clarity(template)
        specificity = self._specificity(template)
        completeness = self._completeness(template)
        brevity = self._brevity(template)
        w = self.weights
        return (w["clarity"] * clarity + w["specificity"] * specificity +
                w["completeness"] * completeness + w["brevity"] * brevity)

    @staticmethod
    def _clarity(t: str) -> float:
        return 1.0 if "请" in t else 0.5

    @staticmethod
    def _specificity(t: str) -> float:
        return min(1.0, 0.3 + 0.1 * t.count("："))

    @staticmethod
    def _completeness(t: str) -> float:
        keywords = ["要求", "示例", "步骤", "依据"]
        return min(1.0, 0.2 + 0.2 * sum(1 for k in keywords if k in t))

    @staticmethod
    def _brevity(t: str) -> float:
        return max(0.0, 1.0 - len(t) / 200.0)


class PromptEngineering:
    """繁星的提示工程内核：整合生成、优化、评估与自动优化。"""

    def __init__(self):
        self.generator = PromptGenerator()
        self.optimizer = PromptOptimizer()
        self.evaluator = PromptEvaluator()
        self.ab_history: List[Dict] = []

    def generate(self, task_type: str, variables: Dict[str, str]) -> Prompt:
        return self.generator.generate(task_type, variables)

    def optimize(self, prompt: Prompt, generations: int = 5) -> Prompt:
        eval_fn = self.evaluator.evaluate
        # 先用文本梯度做局部优化
        refined = self.optimizer.text_gradient(prompt, eval_fn)
        prompt.template = refined
        prompt.score = eval_fn(refined)
        # 再用进化算法做全局优化
        seed_population = [prompt]
        # 生成初始种群
        for _ in range(7):
            mutated = prompt.template
            if random.random() < 0.5:
                mutated = random.choice(self.optimizer.edit_ops)(mutated)
            seed_population.append(Prompt(template=mutated,
                                          variables=prompt.variables,
                                          temperature=prompt.temperature))
        best = self.optimizer.evolve(seed_population, eval_fn,
                                     generations=generations,
                                     population_size=8)
        return best

    def ab_test(self, prompt_a: Prompt, prompt_b: Prompt,
                sample_size: int = 10) -> Dict:
        """A/B 测试：模拟多次评估，比较两提示的平均分。"""
        scores_a = [self.evaluator.evaluate(prompt_a.template) for _ in range(sample_size)]
        scores_b = [self.evaluator.evaluate(prompt_b.template) for _ in range(sample_size)]
        mean_a = sum(scores_a) / len(scores_a)
        mean_b = sum(scores_b) / len(scores_b)
        result = {
            "mean_a": round(mean_a, 3),
            "mean_b": round(mean_b, 3),
            "winner": "A" if mean_a >= mean_b else "B",
            "lift": round(abs(mean_a - mean_b), 3),
        }
        self.ab_history.append(result)
        return result


# ---------- 简单测试 ----------
if __name__ == "__main__":
    pe = PromptEngineering()
    p = pe.generate("qa", {"question": "什么是因果推理？"})
    print("初始提示:", p.template)
    print("初始得分:", round(pe.evaluator.evaluate(p.template), 3))
    best = pe.optimize(p, generations=4)
    print("优化后提示:", best.template)
    print("优化后得分:", round(best.score, 3), "谱系:", best.lineage or "root")
    # A/B 测试
    p_b = Prompt(template="回答：{question}。", variables=["question"])
    print("A/B 测试:", pe.ab_test(p, p_b, sample_size=5))
```
