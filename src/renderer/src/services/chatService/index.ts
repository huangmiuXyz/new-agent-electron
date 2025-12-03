import { convertToModelMessages, ToolLoopAgent } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
}
export const chatService = ({ model, apiKey, baseURL, provider }: ChatServiceOptions) => {
  const createAgent = async (messages: BaseMessage[]) => {
    const deepseekProvider = createDeepSeek({
      apiKey,
      baseURL
    })
    const agent = new ToolLoopAgent({
      model: deepseekProvider(model)
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
  return {
    createAgent
  }
}
