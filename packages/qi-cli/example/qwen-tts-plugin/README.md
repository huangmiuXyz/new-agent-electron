# 通义千问 TTS 创空间适配插件

该插件用于在 Agent-Qi 中接入基于 ModelScope 创空间部署的 Qwen TTS 服务。

## 启用后会增加什么

- 一个自动出现的 `Qwen TTS` 语音提供商
- 一个可直接使用的语音模型：`Qwen3-TTS 1.7B`
- 预置音色列表

## 当前内置模型与音色

模型：

- `Qwen3-TTS 1.7B`

内置音色：

- `Vivian`
- `Serena`
- `Uncle_Fu`
- `Dylan`
- `Eric`
- `Ryan`
- `Aiden`
- `Ono_Anna`
- `Sohee`

## 默认配置

- 默认服务地址：`https://qwen-qwen3-tts.ms.show/`
- 鉴权方式：ModelScope Studio Token

## 使用前准备

- 可访问的 Qwen TTS 创空间地址
- ModelScope Studio Token

## 使用方式

1. 启用插件。
2. 打开自动出现的 `Qwen TTS` 提供商配置。
3. 填写服务地址和 Studio Token。
4. 保存配置。
5. 在语音设置中选择 `Qwen TTS`、模型和音色。

## 适用平台

- 桌面端
- 移动端
