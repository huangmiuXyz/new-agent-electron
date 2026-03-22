# Codex 代理服务插件

这个插件为 Agent-Qi 扩展一个本地 `OpenAI-compatible` Provider，并通过插件自带的 `server.cjs` 把请求转发到 Codex 接口，方便直接在应用里接入 Codex 能力。

插件默认会读取 `~/.codex/auth.json`，自动发现当前已登录的 Codex 账号，一般不需要手动填写 token。

## 扩展了什么功能

- 注册本地 OpenAI 兼容 Provider，可直接接入 Agent-Qi 的模型体系
- 提供本地 `/v1/models`、`/v1/chat/completions`、`/v1/responses` 接口
- 提供 `/codex/usage` 接口，展示套餐、5 小时额度、7 天额度和 credits 余额
- 在首次调用前自动拉起本地 bridge 进程，减少手动启动成本
- 自动读取 `~/.codex/auth.json` 中的账号、邮箱、套餐和 token 信息
- 支持在插件面板里查看账号状态、更新时间和额度情况

## 使用方式

1. 安装并启用插件。
2. 确认本机已经登录 Codex，且存在 `~/.codex/auth.json`。
3. 在 Agent-Qi 中选择“Codex 代理服务”提供商。
4. 首次发起请求时，插件会自动启动本地桥接服务。
5. 如需排查问题，可在插件状态页查看账号信息和额度读取结果。

## 适用平台

- 桌面端

## 注意事项

- 插件依赖本地进程拉起能力，移动端不支持
- 如果本机没有 Codex 登录态，插件无法自动获取认证信息
