# Vosk 离线语音识别插件

该插件用于在 Agent-Qi 中接入 Vosk 本地离线语音识别能力。

## 启用后会增加什么

- 一个自动出现的 `Vosk` 语音识别提供商
- 模型下载与启用界面
- 实时语音识别能力

## 当前可下载模型

- `Vosk 中文模型 (精简版)`
- `Vosk 中文模型`
- `Vosk English Model (Small)`
- `Vosk English Model`
- `Vosk Russian Model (Small)`
- `Vosk French Model (Small)`
- `Vosk German Model (Small)`
- `Vosk Spanish Model (Small)`
- `Vosk Portuguese Model (Small)`
- `Vosk Italian Model (Small)`
- `Vosk Japanese Model (Small)`
- `Vosk Korean Model (Small)`
- `Vosk Vietnamese Model (Small)`
- `Vosk Turkish Model (Small)`

这些模型会从 `https://alphacephei.com/vosk/models/` 下载。

## 使用前准备

- 首次下载模型时需要联网
- 本机需要有足够空间保存模型文件

## 使用方式

1. 启用插件。
2. 打开自动出现的 `Vosk` 语音识别提供商。
3. 下载并启用所需语言模型。
4. 将默认语音识别提供商切换为 `Vosk`。
5. 待模型就绪后开始语音输入。

## 适用平台

- 桌面端

## 注意事项

- 模型下载完成后可离线使用
- 该插件依赖桌面端本地模型文件，移动端不支持
