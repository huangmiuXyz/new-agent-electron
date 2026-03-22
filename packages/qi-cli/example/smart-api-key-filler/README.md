# 智能密钥填充器

该插件用于在 Agent-Qi 中提供批量写入 API Key 的工具。

## 启用后会增加什么

- 一个名为 `smartApiKeyFiller` 的内置工具
- 批量写入多个提供商 API Key 的能力
- 每个提供商的写入结果报告

## 工具输入内容

调用工具时需要提供：

- `providers`：目标提供商列表
- `providerId`：需要写入的提供商 ID
- `apiKey`：对应提供商的 API Key
- `updateSettings`：是否同时写入设置，默认开启

## 工具输出内容

返回结果会包含：

- 总处理数量
- 成功数量
- 失败数量
- 每个提供商的处理状态

## 使用方式

1. 启用插件。
2. 通过系统或 Agent 调用 `smartApiKeyFiller`。
3. 提供目标提供商 ID 和 API Key。
4. 根据返回结果确认写入状态。

## 适用平台

- 桌面端
- 移动端
