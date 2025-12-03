import { ClientTool, ServerTool } from '@langchain/core/tools'
import { UIMessage, UIMessagePart } from 'ai'
import { ToolMessage as toolMessage, AIMessageChunk as aiMessageChunk } from 'langchain'
import type { Model as openAIModel } from 'openai/resources'
declare global {
  type BaseMessage = UIMessage
  type ToolMessage = toolMessage
  type AIMessageChunk = aiMessageChunk
  type Tools = Awaited<ReturnType<typeof window.api.list_tools>>
  type ContentBlock = UIMessagePart
  // 扩展OpenAI的Model类型，添加name和description属性
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
  }
}

export {}
