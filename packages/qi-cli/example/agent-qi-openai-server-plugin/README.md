# Agent-Qi OpenAI 兼容服务

该插件会启动一个本机 Node.js 服务，将 Agent-Qi 当前配置的文本模型暴露为 OpenAI 兼容接口。

## 接口

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`

请求需要携带：

```http
Authorization: Bearer <插件中设置的 API Key>
```

## 示例

```bash
curl http://127.0.0.1:18188/v1/chat/completions \
  -H "Authorization: Bearer sk-agent-qi-local" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai:gpt-4.1-mini",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

`model` 可以使用 `providerId:modelId`，也可以直接使用模型 ID。直接使用模型 ID 时，会优先使用插件配置的默认 provider。
