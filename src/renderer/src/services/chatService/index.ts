import { convertToModelMessages, ToolLoopAgent } from 'ai'
import { createRegistry } from './registry'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  modelType: 'anthropic' | 'openai' | 'deepseek' | 'google' | 'xai'
}

interface ChatServiceConfig {
  mcpClient: ClientConfig
}
export const chatService = () => {
  const createAgent = async (
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions,
    messages: BaseMessage[],
    { mcpClient }: ChatServiceConfig
  ) => {
    const close = messageApi.loading('连接mcp服务器中...')
    let tools: Tools = {}
    try {
      tools = await list_tools(JSON.parse(JSON.stringify(mcpClient)))
    } catch (error) {
      messageApi.error((error as Error).message)
    } finally {
      close()
    }
    const agent = new ToolLoopAgent({
      model: createRegistry({ apiKey, baseURL }).languageModel(`${modelType}:${model}`),
      tools
    })
    const stream = await agent.stream({
      messages: convertToModelMessages(messages)
    })
    const uiStream = stream.toUIMessageStream({
      messageMetadata: () => {
        return { provider, date: Date.now(), model }
      }
    })
    return uiStream
  }
  const list_models = async ({ baseURL, apiKey }) => {
    const models = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      }
    })
    return await models.json()
  }
  const list_tools = async (config: ClientConfig, cache?: boolean) => {
    const tools = await window.api.list_tools(config, cache)
    return tools
  }
  return {
    createAgent,
    list_models,
    list_tools
  }
}
