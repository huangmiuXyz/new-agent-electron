# macOS 原生语音合成插件

该插件用于在 Agent-Qi 中接入 macOS 系统自带的语音合成能力。

## 启用后会增加什么

- 一个自动出现的 `MacOS Native TTS` 提供商
- 一个固定模型：`MacOS Native (say)`
- 从系统命令 `say -v ?` 读取的音色列表

## 音色来源

插件会直接读取 macOS 系统已安装的语音包。显示给用户的音色名称会包含语言代码，例如：

- `Alex (en_US)`
- `Alice (it_IT)`

实际可见音色数量取决于当前系统。

## 使用前准备

- macOS 设备
- 系统已安装语音包

## 使用方式

1. 启用插件。
2. 打开语音设置。
3. 选择 `MacOS Native TTS`。
4. 选择 `MacOS Native (say)` 和系统音色后开始使用。

## 适用平台

- 桌面端

## 注意事项

- 仅支持 macOS
