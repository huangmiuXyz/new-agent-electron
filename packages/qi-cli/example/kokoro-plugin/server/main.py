#!/usr/bin/env python3
"""
Kokoro TTS Server
提供 HTTP API 接口用于语音合成
"""

import os
import sys
import base64
import io
import logging
from typing import Optional, Literal
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局变量
pipeline = None
model = None

# 模型路径配置
MODEL_PATH = os.environ.get('KOKORO_MODEL_PATH', '/Users/Zhuanz/obj/private/Kokoro-82M-v1___1-zh')
DEVICE = os.environ.get('KOKORO_DEVICE', 'cpu')


class TTSRequest(BaseModel):
    """TTS 请求模型"""
    text: str = Field(..., description="要合成的文本")
    voice: str = Field(default="zf_001", description="音色ID")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="语速，范围 0.5-2.0")
    format: Literal["mp3", "wav", "pcm"] = Field(default="wav", description="音频格式")
    lang: Literal["zh", "en", "auto"] = Field(default="auto", description="语言")


class TTSResponse(BaseModel):
    """TTS 响应模型"""
    audio: str = Field(..., description="Base64 编码的音频数据")
    sampleRate: int = Field(default=24000, description="采样率")
    format: str = Field(..., description="音频格式")
    duration: Optional[float] = Field(default=None, description="音频时长（秒）")


class VoiceInfo(BaseModel):
    """音色信息"""
    id: str
    name: str
    language: Literal["zh", "en", "mixed"]
    gender: Optional[Literal["male", "female"]] = None
    description: Optional[str] = None


class ListVoicesResponse(BaseModel):
    """列出音色响应"""
    voices: list[VoiceInfo]


# 默认音色列表
DEFAULT_VOICES = [
    # English female voices
    VoiceInfo(id="af_maple", name="Maple (English Female)", language="en", gender="female", description="American female voice"),
    VoiceInfo(id="af_sol", name="Sol (English Female)", language="en", gender="female", description="American female voice"),
    VoiceInfo(id="bf_vale", name="Vale (English Female)", language="en", gender="female", description="British female voice"),
    # Chinese female voices
    VoiceInfo(id="zf_001", name="中文女声 001", language="zh", gender="female", description="标准中文女声"),
    VoiceInfo(id="zf_002", name="中文女声 002", language="zh", gender="female", description="温柔中文女声"),
    VoiceInfo(id="zf_003", name="中文女声 003", language="zh", gender="female", description="活泼中文女声"),
    VoiceInfo(id="zf_004", name="中文女声 004", language="zh", gender="female", description="成熟中文女声"),
    VoiceInfo(id="zf_005", name="中文女声 005", language="zh", gender="female", description="甜美中文女声"),
    VoiceInfo(id="zf_006", name="中文女声 006", language="zh", gender="female", description="清晰中文女声"),
    VoiceInfo(id="zf_007", name="中文女声 007", language="zh", gender="female", description="自然中文女声"),
    VoiceInfo(id="zf_008", name="中文女声 008", language="zh", gender="female", description="优雅中文女声"),
    # Chinese male voices
    VoiceInfo(id="zm_009", name="中文男声 009", language="zh", gender="male", description="标准中文男声"),
    VoiceInfo(id="zm_010", name="中文男声 010", language="zh", gender="male", description="磁性中文男声"),
    VoiceInfo(id="zm_011", name="中文男声 011", language="zh", gender="male", description="成熟中文男声"),
    VoiceInfo(id="zm_012", name="中文男声 012", language="zh", gender="male", description="年轻中文男声"),
    VoiceInfo(id="zm_013", name="中文男声 013", language="zh", gender="male", description="稳重中文男声"),
    VoiceInfo(id="zm_014", name="中文男声 014", language="zh", gender="male", description="活力中文男声"),
    VoiceInfo(id="zm_015", name="中文男声 015", language="zh", gender="male", description="深沉中文男声"),
    VoiceInfo(id="zm_016", name="中文男声 016", language="zh", gender="male", description="温和中文男声"),
]


def get_available_voices() -> list[VoiceInfo]:
    """获取可用的音色列表"""
    voices_dir = os.path.join(MODEL_PATH, "voices")
    if not os.path.exists(voices_dir):
        return DEFAULT_VOICES
    
    available_voices = []
    voice_files = {f.replace(".pt", "") for f in os.listdir(voices_dir) if f.endswith(".pt")}
    
    for voice in DEFAULT_VOICES:
        if voice.id in voice_files:
            available_voices.append(voice)
    
    return available_voices if available_voices else DEFAULT_VOICES


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global pipeline, model
    
    logger.info("正在初始化 Kokoro TTS 模型...")
    logger.info(f"模型路径: {MODEL_PATH}")
    logger.info(f"设备: {DEVICE}")
    
    try:
        from kokoro import KPipeline, KModel
        import torch
        
        REPO_ID = 'hexgrad/Kokoro-82M-v1.1-zh'
        
        # 加载模型 (参考 samples/make_zh.py)
        logger.info(f"正在加载模型: {REPO_ID}")
        logger.info(f"使用设备: {DEVICE}")

        model = KModel(repo_id=REPO_ID).to(DEVICE).eval()
        logger.info("模型加载成功")
        
        # 创建英文 pipeline 用于处理英文文本
        en_pipeline = KPipeline(lang_code='a', repo_id=REPO_ID, model=False)
        def en_callable(text):
            if text == 'Kokoro':
                return 'kˈOkəɹO'
            return next(en_pipeline(text)).phonemes
        
        # 创建中文 pipeline
        pipeline = KPipeline(lang_code='z', repo_id=REPO_ID, model=model, en_callable=en_callable)
        logger.info("Pipeline 创建成功")
        
        logger.info("Kokoro TTS 模型初始化完成")
    except Exception as e:
        logger.error(f"模型初始化失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        logger.warning("TTS 功能将不可用，请检查模型文件和依赖")
    
    yield
    
    # 清理
    logger.info("正在关闭 Kokoro TTS 服务...")
    pipeline = None
    model = None


# 创建 FastAPI 应用
app = FastAPI(
    title="Kokoro TTS Server",
    description="Kokoro 开源 TTS 模型的 HTTP API 服务",
    version="1.0.0",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "Kokoro TTS Server",
        "version": "1.0.0",
        "status": "running" if pipeline else "model not loaded"
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy" if pipeline else "unhealthy",
        "model_loaded": pipeline is not None
    }


@app.get("/voices", response_model=ListVoicesResponse)
async def list_voices():
    """列出可用的音色"""
    voices = get_available_voices()
    return ListVoicesResponse(voices=voices)


@app.post("/tts", response_model=TTSResponse)
async def text_to_speech(request: TTSRequest):
    """
    文本转语音
    
    - **text**: 要合成的文本
    - **voice**: 音色ID
    - **speed**: 语速 (0.5-2.0)
    - **format**: 输出格式 (wav/mp3/pcm)
    - **lang**: 语言 (zh/en/auto)
    """
    if pipeline is None:
        raise HTTPException(status_code=503, detail="TTS 模型未加载，请检查服务配置")
    
    try:
        logger.info(f"TTS 请求: voice={request.voice}, speed={request.speed}, text={request.text[:50]}...")
        
        # 执行推理
        generator = pipeline(
            request.text,
            voice=request.voice,
            speed=request.speed,
            split_pattern=r'\n+'
        )
        
        # 收集音频数据
        audio_segments = []
        for _, _, audio in generator:
            audio_segments.append(audio)
        
        # 合并音频
        if not audio_segments:
            raise HTTPException(status_code=500, detail="音频生成失败")
        
        combined_audio = np.concatenate(audio_segments)
        
        # 转换为字节
        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        audio_bytes = buffer.read()
        
        # Base64 编码
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        # 计算时长
        duration = len(combined_audio) / 24000
        
        logger.info(f"TTS 成功: duration={duration:.2f}s")
        
        return TTSResponse(
            audio=audio_base64,
            sampleRate=24000,
            format="wav",
            duration=duration
        )
        
    except Exception as e:
        logger.error(f"TTS 失败: {e}")
        raise HTTPException(status_code=500, detail=f"TTS 失败: {str(e)}")


def main():
    """主函数"""
    import uvicorn
    
    host = os.environ.get('KOKORO_HOST', '0.0.0.0')
    port = int(os.environ.get('KOKORO_PORT', '18889'))
    
    logger.info(f"启动 Kokoro TTS Server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
