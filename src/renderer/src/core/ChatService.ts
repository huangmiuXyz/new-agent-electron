import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { LLMClientFactory } from './llm/LLMClientFactory'
import { ToolService } from './tool/ToolService'
import { MessageProcessor } from './message/MessageProcessor'
import { StreamHandler } from './stream/StreamHandler'
import { nanoid } from '../utils/nanoid'
import type { BaseMessage, ContentBlock, ToolCall } from '@langchain/core/messages'
import { ClientConfig } from '@langchain/mcp-adapters'
export interface ChatConfig {
  provider: Provider
  model: Model
  chat: Chat
  agent: Agent
  mcpConfig: { mcpServers: McpServers }
  content: ContentBlock[]
  additional_kwargs: Additional_kwargs
}
export class ChatService {
  private llmFactory: LLMClientFactory
  private toolService: ToolService
  private messageProcessor: MessageProcessor
  private streamHandler: StreamHandler

  constructor(
    llmFactory: LLMClientFactory = new LLMClientFactory(),
    toolService: ToolService = new ToolService(),
    messageProcessor: MessageProcessor = new MessageProcessor(),
    streamHandler: StreamHandler = new StreamHandler()
  ) {
    this.llmFactory = llmFactory
    this.toolService = toolService
    this.messageProcessor = messageProcessor
    this.streamHandler = streamHandler
  }

  async generateResponse(
    messages: BaseMessage[],
    chatConfig: ChatConfig,
    onProgress?: () => void,
    recursionLimit: number = 5
  ): Promise<void> {
    if (recursionLimit <= 0) {
      console.warn('达到最大工具递归调用次数，停止生成')
      return
    }

    const { provider, model, chat, agent, mcpConfig, content, additional_kwargs } = chatConfig

    try {
      // 处理消息
      const processedMessages = this.messageProcessor.processMessages(messages, agent?.systemPrompt)

      // 创建AI消息
      const aiMsg = new AIMessage({
        id: nanoid(),
        content,
        additional_kwargs,
        tool_calls: []
      })
      chat.messages.push(aiMsg)

      // 创建LLM客户端并调用
      const client = this.llmFactory.createClient(provider, model)
      const runnable = client.bindTools(await this.toolService.getTools(mcpConfig))

      const finalResponse = await runnable.invoke(processedMessages, {
        callbacks: [
          {
            handleLLMNewToken: (...args) => {
              this.streamHandler.handleToken(...args, content, additional_kwargs)
              onProgress?.()
            }
          }
        ]
      })

      // 处理工具调用
      if (finalResponse.tool_calls!.length > 0) {
        await this.handleToolCalls(finalResponse.tool_calls!, mcpConfig, chat, aiMsg)

        // 递归调用
        await this.generateResponse(chat.messages, chatConfig, onProgress, recursionLimit - 1)
      }
    } catch (error) {
      this.handleError(error, content)
    }
  }

  private async handleToolCalls(
    toolCalls: ToolCall[],
    mcpConfig: ClientConfig,
    chat: Chat,
    aiMsg: AIMessage
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolMsg = await this.createToolMessage(toolCall, mcpConfig)
      chat.messages.push(toolMsg)
    }

    aiMsg.tool_calls = toolCalls
  }

  private async createToolMessage(
    toolCall: ToolCall,
    mcpConfig: ClientConfig
  ): Promise<ToolMessage> {
    const toolMsgId = nanoid()
    const toolMsg = new ToolMessage({
      id: toolMsgId,
      tool_call_id: toolCall.id!,
      name: toolCall.name,
      content: ''
    })

    try {
      const result = await this.toolService.callTool(toolCall as any, mcpConfig)
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
      toolMsg.content = resultStr
    } catch (error) {
      toolMsg.content = `Error: ${error instanceof Error ? error.message : String(error)}`
      toolMsg.additional_kwargs = { error: true }
    }

    return toolMsg
  }

  private handleError(error: any, content: any[]): void {
    console.error('生成失败:', error)
    content[0].text += `\n[系统错误: ${error instanceof Error ? error.message : String(error)}]`
  }

  async listModels(apiKey: string, baseURL: string): Promise<{ data: Model[] }> {
    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    return await response.json()
  }
}
