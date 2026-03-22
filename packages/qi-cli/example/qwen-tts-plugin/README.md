# 通义千问 TTS 创空间适配插件

这个插件为 Agent-Qi 扩展基于 ModelScope 创空间的 Qwen TTS 服务接入能力，适合快速接入托管版语音合成。

## 扩展了什么功能

- 通过 `@gradio/client` 连接创空间托管的 Qwen TTS 实例
- 把创空间语音服务注册为应用内的独立 TTS Provider
- 支持使用 Studio Token 鉴权
- 支持自定义创空间地址，便于替换不同部署实例

## 配置方式

- `Base URL`：创空间 Gradio 地址，例如 `https://qwen-qwen3-tts.ms.show/`
- `API Key`：ModelScope Studio Token，请求时通过请求头传递

## 使用方式

1. 启用插件。
2. 配置创空间地址和 Studio Token。
3. 在语音设置中选择该 Provider。
4. 选择模型后即可进行语音合成。

## 适用平台

- 桌面端
- 移动端
