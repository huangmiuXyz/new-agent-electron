import { ClientTool, ServerTool } from '@langchain/core/tools'
import { UIMessage, UIMessagePart } from 'ai'
import { ToolMessage as toolMessage, AIMessageChunk as aiMessageChunk } from 'langchain'
import type { Model as openAIModel } from 'openai/resources'
declare global {
  type BaseMessage = UIMessage<{
    provider: string
    date: number
  }>
  type ToolMessage = toolMessage
  type AIMessageChunk = aiMessageChunk
  type Tools = Awaited<ReturnType<typeof window.api.list_tools>>
  type ContentBlock = UIMessagePart
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
  }
}

export {}
