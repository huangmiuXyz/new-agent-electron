import { UIMessage, UIMessagePart } from 'ai'
import type { Model as openAIModel } from 'openai/resources'
declare global {
  type BaseMessage = UIMessage<{
    provider: string
    date: number
    model: string
    stop: AbortController['abort']
  }>
  type Tools = Awaited<ReturnType<typeof window.api.list_tools>>
  type ContentBlock = UIMessagePart
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
  }
  type ClientConfig = Record<
    string,
    {
      command?: string
      args?: string[]
      url?: string
      transport?: 'http' | 'sse' | 'stdio'
      headers?: Record<string, string>
      active: boolean
      tools: Tools
      [key: string]: any
    }
  >
}

export {}
