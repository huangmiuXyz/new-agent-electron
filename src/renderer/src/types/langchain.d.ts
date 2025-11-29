import { ClientTool, ServerTool } from '@langchain/core/tools'
import { BaseMessage as baseMessage } from 'langchain'
import type { Model as openAIModel } from 'openai/resources'
declare global {
  type BaseMessage = baseMessage
  type Tools = Awaited<ReturnType<typeof window.api.list_tools>>
  // 扩展OpenAI的Model类型，添加name和description属性
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
  }
}

export {}
