# 通义千问 TTS 创空间适配插件

该插件用于将基于 ModelScope 创空间部署的 Qwen TTS 服务接入 Agent-Qi。

## 主要功能

- 连接创空间托管的 Qwen TTS 服务
- 自动注册可直接使用的 TTS Provider
- 支持 Studio Token 鉴权
- 支持自定义创空间实例地址

## 使用前准备

- 可访问的 Qwen TTS 创空间地址
- ModelScope Studio Token

## 使用方式

1. 启用插件。
2. 在插件提供的配置表单中填写创空间地址和 Studio Token。
3. 保存配置后，在语音设置中选择 `Qwen TTS`。
4. 选择模型后开始语音合成。

## 配置说明

- `Base URL`：创空间地址，例如 `https://qwen-qwen3-tts.ms.show/`
- `API Key`：ModelScope Studio Token

## 适用平台

- 桌面端
- 移动端
