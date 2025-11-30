import { AIMessage, ToolMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type {
  NewTokenIndices,
  HandleLLMNewTokenCallbackFields
} from '@langchain/core/callbacks/base'
import type { ChatGenerationChunk } from '@langchain/core/outputs'
import { MCPService } from './mcpService'
import type { ClientConfig } from '@langchain/mcp-adapters'
import { nanoid } from '../utils/nanoid'

interface AgentRunOptions {
  client: BaseChatModel
  messages: BaseMessage[]
  mcpConfig: ClientConfig
  recursionLimit?: number
  onToken: (chunk: AIMessageChunk, aggregatedChunk: AIMessageChunk) => void
  onToolResult?: (msg: ToolMessage) => void
  onError: (error: any) => void
}

export async function runAgentLoop({
  client,
  messages,
  mcpConfig,
  recursionLimit = 5,
  onToken,
  onToolResult,
  onError
}: AgentRunOptions) {
  if (recursionLimit <= 0) {
    console.warn('达到最大工具递归调用次数，停止生成')
    return
  }

  const tools = await MCPService.getTools(mcpConfig)
  const runnable = client.bindTools ? client.bindTools(tools) : client

  let aggregatedChunk = new AIMessageChunk({ content: [] })

  try {
    const validMessages = messages.filter((m) => {
      if (!AIMessage.isInstance(m)) return true
      const text = Array.isArray(m.content) ? (m.content[0]?.text as string) : m.content
      const hasText = text && text.trim() !== ''
      const hasTools = m.tool_calls && m.tool_calls.length > 0
      return hasText || hasTools
    })

    const finalResponse = await runnable.invoke(validMessages, {
      callbacks: [
        {
          handleLLMNewToken: (
            _token: string,
            _idx: NewTokenIndices,
            _runId: string,
            _parentRunId?: string,
            _tags?: string[],
            fields?: HandleLLMNewTokenCallbackFields
          ) => {
            const chunk = (fields?.chunk as ChatGenerationChunk).message as AIMessageChunk
            aggregatedChunk = aggregatedChunk.concat(chunk)
            onToken(chunk, aggregatedChunk)
          }
        }
      ]
    })
    if (finalResponse.tool_calls && finalResponse.tool_calls.length > 0) {
      const toolMessages: ToolMessage[] = []

      for (const toolCall of finalResponse.tool_calls) {
        const toolMsgId = nanoid()
        let content = ''
        let isError = false

        try {
          const result = await MCPService.callTool(toolCall as any, mcpConfig)
          content = typeof result === 'string' ? result : JSON.stringify(result)
        } catch (error) {
          content = `Error: ${error instanceof Error ? error.message : String(error)}`
          isError = true
        }

        const toolMsg = new ToolMessage({
          id: toolMsgId,
          tool_call_id: toolCall.id!,
          content,
          name: toolCall.name,
          additional_kwargs: isError ? { error: true } : undefined
        })

        toolMessages.push(toolMsg)
        onToolResult?.(toolMsg)
      }

      await runAgentLoop({
        client,
        messages: [...validMessages, finalResponse, ...toolMessages],
        mcpConfig,
        recursionLimit: recursionLimit - 1,
        onToken,
        onToolResult,
        onError
      })
    }
  } catch (error) {
    onError(error)
  }
}
