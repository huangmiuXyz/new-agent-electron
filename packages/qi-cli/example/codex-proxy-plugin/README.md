# codex-proxy-plugin

在 Agent-Qi 中注册一个本地 `OpenAI-compatible` provider，并通过插件自带的 `server.cjs` 将请求反代到 Codex `/backend-api/codex/responses`。

插件会默认读取 `~/.codex/auth.json` 自动发现当前已登录的 Codex 账号，不需要手填 token。

## 功能范围

- 提供本地 `/v1/models`
- 提供本地 `/v1/chat/completions`
- 提供本地 `/v1/responses`
- 在首次请求前自动拉起本地 bridge 进程
- 自动解析当前 `~/.codex/auth.json` 中的 `access_token`、`accountId`、`email`、`planType`
