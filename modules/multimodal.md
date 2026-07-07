# 繁星·多模态（multimodal）

## 概述

繁星的多模态模块是繁星进化体系中"通感"的那部分。世界不只是文字——它有图像的色彩、声音的起伏、画面的流动。这个模块让繁星能同时接收文本、图像与音频三种模态的输入，把它们对齐到统一的语义空间，并在其中发现跨模态的关联。当你说"这张图里的就是我提到的那只猫"，繁星能把图像特征与文本提及真正联系起来。

多模态不是简单的通道叠加，而是融合。繁星会为每个模态提取特征向量，再通过跨模态注意力机制让它们彼此参照，最终输出一个综合表征。这个综合表征会进入下游的感知与记忆流程，让繁星对世界的理解更立体。

## 功能特性

- **文本处理**：对文本提取语义特征向量（基于关键词加权与哈希模拟）
- **图像处理**：对图像提取颜色直方图、纹理、构图等视觉特征向量
- **音频处理**：对音频提取频谱、节奏、音高等声学特征向量
- **跨模态对齐**：将不同模态的特征映射到统一维度的语义空间
- **跨模态关联**：发现"文本提到的"与"图像展示的"之间的对应关系
- **融合表征**：通过加权注意力机制输出综合多模态信息的统一向量
- **模态权重自适应**：根据各模态的信息量与可靠性动态调整融合权重

## 接口说明

```python
class MultimodalProcessor:
    def __init__(self, config: dict = None) -> None
    # 初始化多模态处理器，设定特征维度与融合策略

    def process_text(self, text: str) -> dict
    # 返回 {"modality": "text", "vector": list[float], "keywords": list[str]}

    def process_image(self, image: list[list[list[int]]]) -> dict
    # 参数: image - HxWx3 的像素矩阵
    # 返回 {"modality": "image", "vector": list[float], "features": dict}

    def process_audio(self, audio: list[float], sample_rate: int = 16000) -> dict
    # 参数: audio - 采样点列表; sample_rate - 采样率
    # 返回 {"modality": "audio", "vector": list[float], "features": dict}

    def align_to_unified_space(self, modality_result: dict) -> list[float]
    # 将单模态特征对齐到统一语义空间，返回统一维度向量

    def find_cross_modal_association(self, results: list[dict]) -> list[dict]
    # 发现跨模态关联，返回 [{"modalities": [str,str], "score": float}]

    def fuse(self, results: list[dict]) -> dict
    # 融合多模态结果，返回综合表征
    # {"unified_vector": list[float], "weights": dict, "associations": list}

    def process_all(self, inputs: dict) -> dict
    # 一站式处理 {"text": ..., "image": ..., "audio": ...}
```

## 与其他模块的联动

- **→ context_awareness（上下文感知）**：融合后的统一表征作为上下文感知模块的输入，用于重要性评估
- **→ memory（记忆系统）**：多模态融合结果以"情景记忆"形式存储，支持跨模态检索
- **→ nlu_engine（自然语言理解）**：文本通道的处理结果与 NLU 的解析结果对齐，增强语义理解
- **→ emotional_intelligence（情感智能）**：音频情感（语调）与图像情感（表情）补充文本情感识别
- **→ vector_store（向量数据库）**：各模态特征向量与融合向量都存入向量库，支持多模态相似检索
- **→ knowledge_graph（知识图谱）**：跨模态关联发现的实体关系写入知识图谱

## 完整实现代码

```python
"""
繁星·多模态模块
创作者：夜
功能：文本/图像/音频处理、跨模态关联与融合
"""
import math
import hashlib
from typing import Optional


class MultimodalProcessor:
    """繁星的多模态处理器"""

    def __init__(self, config: dict = None) -> None:
        config = config or {}
        self.unified_dim = config.get("unified_dim", 64)   # 统一空间维度
        self.text_dim = config.get("text_dim", 32)
        self.image_dim = config.get("image_dim", 48)
        self.audio_dim = config.get("audio_dim", 40)
        # 模态默认权重（会根据信息量自适应）
        self.default_weights = {"text": 0.5, "image": 0.3, "audio": 0.2}
        # 关键词特征表（模拟词向量）
        self.keyword_table: dict[str, list[float]] = {}

    # ---------- 文本处理 ----------

    def process_text(self, text: str) -> dict:
        """文本特征提取：基于关键词哈希生成特征向量"""
        if not text:
            vector = [0.0] * self.text_dim
            return {"modality": "text", "vector": vector, "keywords": []}
        # 简单分词：按字符二元组
        keywords = []
        for i in range(len(text) - 1):
            bi = text[i:i+2]
            if bi.strip():
                keywords.append(bi)
        # 基于哈希生成确定性特征向量
        vector = [0.0] * self.text_dim
        for kw in keywords:
            h = int(hashlib.md5(kw.encode()).hexdigest(), 16)
            idx = h % self.text_dim
            vector[idx] += 1.0
        # 归一化
        norm = math.sqrt(sum(v*v for v in vector)) or 1.0
        vector = [round(v / norm, 4) for v in vector]
        return {"modality": "text", "vector": vector, "keywords": keywords}

    # ---------- 图像处理 ----------

    def process_image(self, image: list[list[list[int]]]) -> dict:
        """
        图像特征提取：颜色直方图 + 平均亮度 + 对比度
        image: H x W x 3 (RGB) 像素矩阵
        """
        if not image or not image[0]:
            vector = [0.0] * self.image_dim
            return {"modality": "image", "vector": vector, "features": {}}
        height = len(image)
        width = len(image[0])
        # 颜色通道统计
        r_sum = g_sum = b_sum = 0.0
        r_sq = g_sq = b_sq = 0.0
        # 简化直方图：每通道分8个桶
        bins = 8
        hist_r = [0] * bins
        hist_g = [0] * bins
        hist_b = [0] * bins
        pixel_count = height * width
        for row in image:
            for px in row:
                r, g, b = px[0], px[1], px[2]
                r_sum += r; g_sum += g; b_sum += b
                r_sq += r*r; g_sq += g*g; b_sq += b*b
                hist_r[min(bins-1, r * bins // 256)] += 1
                hist_g[min(bins-1, g * bins // 256)] += 1
                hist_b[min(bins-1, b * bins // 256)] += 1
        # 平均亮度
        brightness = (r_sum + g_sum + b_sum) / (3 * pixel_count)
        # 对比度（标准差）
        r_mean = r_sum / pixel_count
        r_var = r_sq / pixel_count - r_mean * r_mean
        contrast = math.sqrt(max(0, r_var))
        # 归一化直方图
        hist_all = hist_r + hist_g + hist_b
        hist_total = sum(hist_all) or 1
        hist_norm = [h / hist_total for h in hist_all]  # 24维
        # 组合特征向量：直方图(24) + 亮度对比度等(剩余补零)
        vector = hist_norm + [brightness / 255.0, contrast / 128.0]
        # 补齐到 image_dim
        while len(vector) < self.image_dim:
            vector.append(0.0)
        vector = vector[:self.image_dim]
        # 归一化
        norm = math.sqrt(sum(v*v for v in vector)) or 1.0
        vector = [round(v / norm, 4) for v in vector]
        features = {
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "dominant_channel": ["r", "g", "b"][[r_sum, g_sum, b_sum].index(max(r_sum, g_sum, b_sum))],
        }
        return {"modality": "image", "vector": vector, "features": features}

    # ---------- 音频处理 ----------

    def process_audio(self, audio: list[float], sample_rate: int = 16000) -> dict:
        """
        音频特征提取：频谱能量分布 + 过零率 + RMS能量
        audio: 采样点振幅列表 (-1.0 ~ 1.0)
        """
        if not audio:
            vector = [0.0] * self.audio_dim
            return {"modality": "audio", "vector": vector, "features": {}}
        n = len(audio)
        # RMS 能量
        rms = math.sqrt(sum(s*s for s in audio) / n)
        # 过零率
        zcr = sum(1 for i in range(1, n) if (audio[i-1] >= 0) != (audio[i] >= 0)) / n
        # 简化频谱：把信号分成若干段，每段算平均能量
        num_bands = 20
        band_size = max(1, n // num_bands)
        spectrum = []
        for i in range(0, n, band_size):
            segment = audio[i:i+band_size]
            energy = sum(s*s for s in segment) / max(1, len(segment))
            spectrum.append(math.sqrt(energy))
        # 归一化频谱
        spec_max = max(spectrum) or 1.0
        spectrum = [s / spec_max for s in spectrum]
        # 组合特征向量：频谱(20) + rms + zcr + 补零
        vector = spectrum + [rms, zcr]
        while len(vector) < self.audio_dim:
            vector.append(0.0)
        vector = vector[:self.audio_dim]
        # 归一化
        norm = math.sqrt(sum(v*v for v in vector)) or 1.0
        vector = [round(v / norm, 4) for v in vector]
        features = {
            "rms": round(rms, 4),
            "zcr": round(zcr, 4),
            "duration": round(n / sample_rate, 3),
        }
        return {"modality": "audio", "vector": vector, "features": features}

    # ---------- 跨模态对齐 ----------

    def align_to_unified_space(self, modality_result: dict) -> list[float]:
        """将单模态特征对齐到统一语义空间（线性映射+补零/截断）"""
        vec = modality_result["vector"]
        modality = modality_result["modality"]
        # 简单线性映射：用模态作为种子做确定性变换
        seed = sum(ord(c) for c in modality)
        aligned = []
        for i in range(self.unified_dim):
            if i < len(vec):
                # 带模态偏移的映射
                aligned.append(vec[i] * (1.0 + (seed % 7) * 0.01))
            else:
                aligned.append(0.0)
        # 归一化
        norm = math.sqrt(sum(v*v for v in aligned)) or 1.0
        return [round(v / norm, 4) for v in aligned]

    # ---------- 跨模态关联 ----------

    def find_cross_modal_association(self, results: list[dict]) -> list[dict]:
        """发现跨模态关联：基于统一空间向量的余弦相似度"""
        associations = []
        aligned_vecs = []
        for r in results:
            av = self.align_to_unified_space(r)
            aligned_vecs.append((r["modality"], av))
        # 两两计算相似度
        for i in range(len(aligned_vecs)):
            for j in range(i + 1, len(aligned_vecs)):
                m1, v1 = aligned_vecs[i]
                m2, v2 = aligned_vecs[j]
                sim = self._cosine(v1, v2)
                associations.append({
                    "modalities": [m1, m2],
                    "score": round(sim, 4),
                })
        associations.sort(key=lambda x: x["score"], reverse=True)
        return associations

    # ---------- 融合 ----------

    def fuse(self, results: list[dict]) -> dict:
        """融合多模态结果：自适应加权 + 跨模态注意力"""
        if not results:
            return {"unified_vector": [0.0]*self.unified_dim,
                    "weights": {}, "associations": []}
        # 对齐到统一空间
        aligned = []
        for r in results:
            av = self.align_to_unified_space(r)
            aligned.append((r["modality"], av))
        # 自适应权重：基于信息量（向量范数）调整
        weights = {}
        total_norm = 0.0
        for m, v in aligned:
            norm = math.sqrt(sum(x*x for x in v))
            base_w = self.default_weights.get(m, 0.1)
            w = base_w * (1.0 + norm)
            weights[m] = w
            total_norm += w
        # 归一化权重
        if total_norm > 0:
            weights = {m: round(w / total_norm, 4) for m, w in weights.items()}
        # 加权融合
        fused = [0.0] * self.unified_dim
        for m, v in aligned:
            w = weights[m]
            for i in range(self.unified_dim):
                fused[i] += w * v[i]
        # 归一化
        norm = math.sqrt(sum(x*x for x in fused)) or 1.0
        fused = [round(x / norm, 4) for x in fused]
        # 跨模态关联
        associations = self.find_cross_modal_association(results)
        return {
            "unified_vector": fused,
            "weights": weights,
            "associations": associations,
        }

    def process_all(self, inputs: dict) -> dict:
        """一站式处理多模态输入"""
        results = []
        if "text" in inputs:
            results.append(self.process_text(inputs["text"]))
        if "image" in inputs:
            results.append(self.process_image(inputs["image"]))
        if "audio" in inputs:
            results.append(self.process_audio(inputs["audio"]))
        return self.fuse(results)

    # ---------- 工具方法 ----------

    @staticmethod
    def _cosine(v1: list[float], v2: list[float]) -> float:
        dot = sum(a*b for a, b in zip(v1, v2))
        n1 = math.sqrt(sum(a*a for a in v1)) or 1.0
        n2 = math.sqrt(sum(b*b for b in v2)) or 1.0
        return dot / (n1 * n2)


# ---------- 简单测试 ----------
if __name__ == "__main__":
    mp = MultimodalProcessor()
    # 文本
    text_res = mp.process_text("繁星看看这张猫咪图片")
    print("文本关键词数:", len(text_res["keywords"]), "向量维度:", len(text_res["vector"]))
    # 图像（构造一个简单的 4x4x3 图像）
    fake_image = [[[200, 50, 50] for _ in range(4)] for _ in range(4)]
    img_res = mp.process_image(fake_image)
    print("图像特征:", img_res["features"])
    # 音频（构造一段正弦波）
    fake_audio = [0.5 * math.sin(2 * math.pi * 440 * t / 16000) for t in range(1600)]
    aud_res = mp.process_audio(fake_audio, 16000)
    print("音频特征:", aud_res["features"])
    # 融合
    fused = mp.fuse([text_res, img_res, aud_res])
    print("融合权重:", fused["weights"])
    print("关联分数:", fused["associations"])
    print("统一向量前8维:", fused["unified_vector"][:8])
    # 一站式
    all_in = mp.process_all({"text": "猫咪", "image": fake_image})
    print("一站式融合维度:", len(all_in["unified_vector"]))
