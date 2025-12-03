import { convertToModelMessages, tool, ToolLoopAgent } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
}

interface ChatServiceConfig {
  tools: Tools
}
export const chatService = () => {
  const createAgent = async (
    { model, apiKey, baseURL, provider }: ChatServiceOptions,
    messages: BaseMessage[],
    { tools }: ChatServiceConfig
  ) => {
    const deepseekProvider = createDeepSeek({
      apiKey,
      baseURL
    })
    const agent = new ToolLoopAgent({
      model: deepseekProvider(model!),
      tools
    })
    const stream = await agent.stream({
      messages: convertToModelMessages(messages)
    })
    return stream.toUIMessageStream({
      messageMetadata: () => {
        return { provider, date: Date.now(), model }
      }
    })
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
  return {
    createAgent,
    list_models
  }
}
