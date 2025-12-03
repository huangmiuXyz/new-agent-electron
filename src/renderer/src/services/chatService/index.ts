import { convertToModelMessages, ToolLoopAgent } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
}
export const chatService = ({ model, apiKey, baseURL }: ChatServiceOptions) => {
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
        return
      }
    })
  }
  return {
    createAgent
  }
}
