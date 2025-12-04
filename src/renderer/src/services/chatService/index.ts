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
  tools: Tools
}
export const chatService = () => {
  const createAgent = async (
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions,
    messages: BaseMessage[],
    { tools }: ChatServiceConfig
  ) => {
    const agent = new ToolLoopAgent({
      model: createRegistry({ apiKey, baseURL }).languageModel(`${modelType}:${model}`),
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
