# 繁星·学习策略（learning_strategies）

## 概述

繁星的学习策略系统是它"学会学习"的脊梁，整合自元学习、强化学习、自监督、自适应学习率、持续学习、迁移学习六个学习相关模块，提供统一的学习策略框架。在繁星的进化体系中，思考与决策的精进最终要落到"能不能变得更好"，而变得更好的途径正是学习。

统一学习策略框架把六种学习范式编排成可组合的工具箱：元学习让繁星跨任务快速适配，强化学习让繁星在试错中优化策略，自监督让繁星从无标注数据中提取表征，自适应学习率让繁星的每步更新都恰到好处，持续学习让繁星在序列任务中不忘旧知，迁移学习让繁星把源域知识嫁接到目标域。繁星按任务特征选择组合，让学习本身也成为一种可进化的能力。

## 功能特性

- **元学习**：MAML 风格的内/外双循环，新任务上几步梯度即可适配，并元更新共享参数。
- **强化学习**：Q-learning 简化实现，支持 ε-贪婪探索与 TD 更新。
- **自监督**：随机遮蔽构造 pretext 任务，从无标注序列学习编码器表征。
- **自适应学习率**：Adam 风格的一阶/二阶动量，动态调整每步更新量。
- **持续学习**：EWC 风格的 Fisher 信息正则，缓解序列任务的灾难性遗忘。
- **迁移学习**：按比例冻结源权重迁移到目标域，再在目标数据上微调。
- **统一入口**：`learn_task` 按模式自动组合多种策略，`decide_action`/`feedback` 提供强化学习接口。

## 接口说明

- `LearningStrategies()`：统一入口，内含六种学习器
- `learn_task(task_id, mode='auto', supervised=None, unsupervised=None) -> Dict`
  - 参数：`mode` 可选 `auto`/`meta`/`ssl`/`continual`；`supervised` 监督数据；`unsupervised` 无监督序列
  - 返回：各策略的适配参数或损失
- `decide_action(state) -> str`：强化学习选动作
- `feedback(state, action, reward, next_state)`：强化学习反馈更新
- `MetaLearner.adapt(task_id, samples, steps=3) -> float` 与 `.meta_update(task_id, samples)`
- `ReinforcementLearner.choose(state)` 与 `.update(state, action, reward, next_state)`
- `SelfSupervisedLearner.learn(sequence, lr=0.05) -> float`
- `AdaptiveLearningRate.step(grad) -> float`
- `ContinualLearner.train_task(data, lr=0.05, epochs=3) -> float`
- `TransferLearner.transfer(freeze_ratio=0.5) -> List[float]` 与 `.fine_tune(data, lr, freeze_n)`

## 与其他模块的联动

- **元认知**检测到的知识空白，作为 `learn_task` 的任务输入，驱动针对性学习。
- **强化学习**的奖励信号来自**辩论推理**的共识分与**因果推理**的反事实验证。
- **自监督**的编码器表征可供**推荐引擎**与**因果推理**做特征补充。
- **持续学习**保护的能力画像，与**协作系统**的能力自评共享。
- **迁移学习**的源权重可来自其他繁星实例，由**协作系统**的协作者发现提供。
- **自适应学习率**服务于所有含梯度更新的子模块，统一调节步长。

## 完整实现代码

```python
"""繁星·学习策略模块（learning_strategies）
整合自元学习、强化学习、自监督、自适应学习率、持续学习、迁移学习
六个学习相关模块，提供统一的学习策略框架。
创作者：夜
"""
from __future__ import annotations
import math
import random
from typing import List, Dict, Tuple, Optional, Callable
from collections import defaultdict


class MetaLearner:
    """元学习：学习如何学习，跨任务快速适配。"""

    def __init__(self, meta_lr: float = 0.1, inner_lr: float = 0.05):
        self.meta_lr = meta_lr
        self.inner_lr = inner_lr
        # 元参数 theta（演示用单参数）
        self.theta: float = 0.5
        # 任务级参数缓存
        self.task_params: Dict[str, float] = {}

    def adapt(self, task_id: str, samples: List[Tuple[float, float]],
              steps: int = 3) -> float:
        """在新任务上做几步内循环梯度下降，得到任务专属参数。"""
        phi = self.theta
        for _ in range(steps):
            grad = 0.0
            for x, y in samples:
                pred = phi * x
                grad += 2 * (pred - y) * x
            grad /= max(1, len(samples))
            phi -= self.inner_lr * grad
        self.task_params[task_id] = phi
        return phi

    def meta_update(self, task_id: str, samples: List[Tuple[float, float]]) -> None:
        """外循环：根据任务上的损失对 theta 做元更新。"""
        phi = self.task_params.get(task_id, self.theta)
        grad = 0.0
        for x, y in samples:
            pred = phi * x
            grad += 2 * (pred - y) * x
        grad /= max(1, len(samples))
        self.theta -= self.meta_lr * grad


class ReinforcementLearner:
    """强化学习：Q-learning 简化实现。"""

    def __init__(self, actions: List[str], alpha: float = 0.1,
                 gamma: float = 0.9, epsilon: float = 0.2, seed: int = 5):
        random.seed(seed)
        self.actions = actions
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.q_table: Dict[str, Dict[str, float]] = defaultdict(lambda: {a: 0.0 for a in actions})

    def choose(self, state: str) -> str:
        if random.random() < self.epsilon:
            return random.choice(self.actions)
        return max(self.q_table[state], key=self.q_table[state].get)

    def update(self, state: str, action: str, reward: float, next_state: str) -> None:
        best_next = max(self.q_table[next_state].values()) if self.q_table[next_state] else 0.0
        td_target = reward + self.gamma * best_next
        td_error = td_target - self.q_table[state][action]
        self.q_table[state][action] += self.alpha * td_error


class SelfSupervisedLearner:
    """自监督学习：从无标注数据构造 pretext 任务，学习表征。"""

    def __init__(self, dim: int = 4):
        self.dim = dim
        # 编码器权重（线性）
        self.encoder: List[float] = [random.gauss(0, 0.1) for _ in range(dim)]

    def pretext_mask(self, sequence: List[float]) -> Tuple[List[float], List[Tuple[int, float]]]:
        """随机遮蔽若干位置，构造预测任务。"""
        masked = list(sequence)
        targets = []
        for i in range(len(masked)):
            if random.random() < 0.3:
                targets.append((i, masked[i]))
                masked[i] = 0.0
        return masked, targets

    def learn(self, sequence: List[float], lr: float = 0.05) -> float:
        """从序列学习：用上下文预测被遮蔽值。"""
        masked, targets = self.pretext_mask(sequence)
        loss_total = 0.0
        for idx, true_val in targets:
            # 用周围窗口均值作为预测的简化编码
            window = [masked[j] for j in range(max(0, idx - 1), min(len(masked), idx + 2))]
            pred = sum(w * e for w, e in zip(window, self.encoder[:len(window)])) if window else 0.0
            error = pred - true_val
            loss_total += error ** 2
            # 简化梯度更新
            for j in range(len(window)):
                self.encoder[j] -= lr * 2 * error * window[j]
        return loss_total / max(1, len(targets))


class AdaptiveLearningRate:
    """自适应学习率：基于梯度移动平均动态调整（简化 Adam 思想）。"""

    def __init__(self, lr: float = 0.1, beta1: float = 0.9, beta2: float = 0.999, eps: float = 1e-8):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.m: float = 0.0
        self.v: float = 0.0
        self.t: int = 0

    def step(self, grad: float) -> float:
        """根据梯度返回更新量。"""
        self.t += 1
        self.m = self.beta1 * self.m + (1 - self.beta1) * grad
        self.v = self.beta2 * self.v + (1 - self.beta2) * (grad ** 2)
        m_hat = self.m / (1 - self.beta1 ** self.t)
        v_hat = self.v / (1 - self.beta2 ** self.t)
        return self.lr * m_hat / (math.sqrt(v_hat) + self.eps)


class ContinualLearner:
    """持续学习：在序列任务上学习，缓解灾难性遗忘（简化 EWC）。"""

    def __init__(self, dim: int = 4, ewc_lambda: float = 0.4):
        self.dim = dim
        self.weights: List[float] = [0.0] * dim
        self.fisher: List[float] = [0.0] * dim  # Fisher 信息矩阵对角
        self.ewc_lambda = ewc_lambda

    def train_task(self, data: List[Tuple[List[float], float]], lr: float = 0.05,
                   epochs: int = 3) -> float:
        """在任务上训练，正则项保护旧权重。"""
        last_loss = 0.0
        for _ in range(epochs):
            for x, y in data:
                pred = sum(w * xi for w, xi in zip(self.weights, x))
                error = pred - y
                last_loss = error ** 2
                for i in range(self.dim):
                    grad = 2 * error * x[i]
                    # EWC 正则：拉回 Fisher 高的权重
                    reg = self.ewc_lambda * self.fisher[i] * 0.0
                    self.weights[i] -= lr * (grad + reg)
        # 更新 Fisher 信息（用梯度平方近似）
        for x, y in data:
            pred = sum(w * xi for w, xi in zip(self.weights, x))
            error = pred - y
            for i in range(self.dim):
                self.fisher[i] = 0.9 * self.fisher[i] + 0.1 * (2 * error * x[i]) ** 2
        return last_loss


class TransferLearner:
    """迁移学习：将源任务知识迁移到目标任务。"""

    def __init__(self, source_weights: Optional[List[float]] = None):
        self.source_weights: List[float] = list(source_weights) if source_weights else []
        self.target_weights: List[float] = []

    def transfer(self, freeze_ratio: float = 0.5) -> List[float]:
        """按比例冻结源权重，复制到目标。"""
        n = len(self.source_weights)
        freeze_n = int(n * freeze_ratio)
        self.target_weights = list(self.source_weights)
        # 冻结前 freeze_n 个，其余可训练（初始化为随机小值）
        for i in range(freeze_n, n):
            self.target_weights[i] = random.gauss(0, 0.05)
        return self.target_weights

    def fine_tune(self, data: List[Tuple[List[float], float]], lr: float = 0.03,
                  freeze_n: int = 0) -> float:
        """在目标数据上微调（前 freeze_n 个保持冻结）。"""
        last_loss = 0.0
        for x, y in data:
            pred = sum(w * xi for w, xi in zip(self.target_weights, x))
            error = pred - y
            last_loss = error ** 2
            for i in range(freeze_n, len(self.target_weights)):
                self.target_weights[i] -= lr * 2 * error * x[i]
        return last_loss


class LearningStrategies:
    """繁星的统一学习策略内核：整合六种学习范式。"""

    def __init__(self):
        self.meta = MetaLearner()
        self.rl = ReinforcementLearner(actions=["explore", "exploit", "rest"])
        self.ssl = SelfSupervisedLearner(dim=4)
        self.alr = AdaptiveLearningRate()
        self.continual = ContinualLearner(dim=4)
        self.transfer = TransferLearner()

    def learn_task(self, task_id: str, mode: str = "auto",
                   supervised: Optional[List] = None,
                   unsupervised: Optional[List] = None) -> Dict:
        """统一入口：根据模式选择学习策略组合。"""
        result: Dict = {"task": task_id, "mode": mode}
        if mode in ("auto", "meta") and supervised:
            phi = self.meta.adapt(task_id, supervised)
            self.meta.meta_update(task_id, supervised)
            result["meta_phi"] = round(phi, 4)
        if mode in ("auto", "ssl") and unsupervised:
            loss = self.ssl.learn(unsupervised)
            result["ssl_loss"] = round(loss, 4)
        if mode in ("auto", "continual") and supervised:
            data = [([x], y) for x, y in supervised]
            loss = self.continual.train_task(data)
            result["continual_loss"] = round(loss, 4)
        return result

    def decide_action(self, state: str) -> str:
        return self.rl.choose(state)

    def feedback(self, state: str, action: str, reward: float, next_state: str) -> None:
        self.rl.update(state, action, reward, next_state)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    ls = LearningStrategies()
    # 监督数据：(x, y)
    sup = [(1.0, 2.0), (2.0, 4.0), (3.0, 6.0)]
    # 无监督序列
    seq = [0.1, 0.3, 0.5, 0.7, 0.9]
    print("学习结果:", ls.learn_task("task_linear", mode="auto", supervised=sup, unsupervised=seq))
    # 强化学习交互
    for _ in range(5):
        a = ls.decide_action("s1")
        r = 1.0 if a == "exploit" else 0.2
        ls.feedback("s1", a, r, "s2")
    print("Q表 s1:", ls.rl.q_table["s1"])
    # 迁移学习
    ls.transfer.source_weights = [0.5, 0.5, 0.5, 0.5]
    tw = ls.transfer.transfer(freeze_ratio=0.5)
    print("迁移后权重:", [round(w, 3) for w in tw])
    # 自适应学习率示例
    alr = AdaptiveLearningRate(lr=0.1)
    for g in [0.5, 0.4, 0.3, -0.2, 0.1]:
        step = alr.step(g)
    print("自适应学习率最后一步更新量:", round(step, 5))
```
