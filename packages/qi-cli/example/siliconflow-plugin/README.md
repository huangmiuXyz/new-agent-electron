# SiliconFlow 语音合成插件

该插件用于在 Agent-Qi 中接入 SiliconFlow 语音合成服务。

## 启用后会增加什么

- 一个可手动添加的 SiliconFlow 语音提供商
- 从 SiliconFlow 接口读取的模型列表
- 语音模型对应的预置音色

## 模型识别方式

插件会从 SiliconFlow 返回的模型列表中自动识别语音模型。模型 ID 中包含以下关键词时，会被视为语音模型：

- `speech`
- `tts`
- `voice`

这些模型会在 Agent-Qi 中显示为语音模型，并附带以下预置音色：

- `Alex`
- `Anna`
- `Bella`
- `Benjamin`
- `Charles`
- `Claire`
- `David`
- `Diana`

## 默认配置

- 默认接口地址：`https://api.siliconflow.cn/v1`
- 默认模型：`fishaudio/fish-speech-1.4`

## 使用前准备

- SiliconFlow 账号
- 可用的 API Key

## 使用方式

1. 启用插件。
2. 在模型提供商设置中手动新增 SiliconFlow 提供商。
3. 填写 API Key 并保存配置。
4. 打开语音设置。
5. 选择 SiliconFlow 语音模型和音色后开始使用。

## 适用平台

- 桌面端
- 移动端
