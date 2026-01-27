# SiliconFlow 语音合成插件

集成硅基流动 (SiliconFlow) 平台的高性能语音合成 (TTS) 能力。

## 主要功能

- **高性能 TTS**：支持集成在 SiliconFlow 上的多种主流 TTS 模型（如 fishaudio/fish-speech-1.4）。
- **多样化音色**：内置多种预置音色，并支持通过 SiliconFlow API 访问更多音色。
- **全局注册**：将 `siliconflow` 注册到应用的模型工厂注册表，专用于语音服务。

## 使用说明

1. 启用插件。
2. 在“提供商设置”中新增 `siliconflow` 类型的提供商。
3. 填入您的 SiliconFlow API Key。
4. 即可在语音设置中调用高性能的国产语音合成服务。
