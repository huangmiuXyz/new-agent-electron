# Moonshot Kimi 大模型插件

该插件用于在 Agent-Qi 中接入 Moonshot AI 的 Kimi 系列模型。

## 启用后会增加什么

- 一个可手动添加的 Moonshot 提供商
- Moonshot 官方模型接入能力
- 额外的思考模式相关选项

## 可用附加选项

在支持的聊天调用中，可以配置以下附加选项：

- 思考模式开关
- 思考预算上限，范围 `0` 到 `4096`
- 推理历史保留方式

可选的推理历史方式包括：

- `disabled`
- `interleaved`
- `preserved`

## 使用前准备

- Moonshot 账号
- 可用的 API Key
- 如有需要，准备自定义访问地址

## 使用方式

1. 启用插件。
2. 在模型提供商设置中手动新增 Moonshot 提供商。
3. 填写 API Key 和访问地址。
4. 刷新模型。
5. 在聊天功能中选择 Moonshot 模型。

## 适用平台

- 桌面端
- 移动端
