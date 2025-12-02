import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { LLMClientFactory } from './llm/LLMClientFactory'
import { ToolService } from './tool/ToolService'
import { MessageProcessor } from './message/MessageProcessor'
import { StreamHandler } from './stream/StreamHandler'
import { nanoid } from '../utils/nanoid'
import type { BaseMessage, ToolCall } from '@langchain/core/messages'
import { ClientConfig } from '@langchain/mcp-adapters'
export interface ChatConfig {
  provider: Provider
  model: Model
  chat: Chat
  agent: Agent
  mcpConfig: { mcpServers: McpServers }
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
    const content = reactive<any[]>([{ type: 'text', text: '' }])

    const { provider, model, chat, agent, mcpConfig, additional_kwargs } = chatConfig

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
      const stream = await runnable.stream(processedMessages)
      for await (const chunk of stream) {
        this.streamHandler.handleToken(chunk, content, aiMsg, additional_kwargs)
        onProgress?.()
      }
      if (aiMsg.tool_calls!.length > 0) {
        await this.handleToolCalls(aiMsg.tool_calls!, mcpConfig, chat)
        await this.generateResponse(chat.messages, chatConfig, onProgress, recursionLimit - 1)
      }
    } catch (error) {
      this.handleError(error, content)
    }
  }

  private async handleToolCalls(
    toolCalls: ToolCall[],
    mcpConfig: ClientConfig,
    chat: Chat
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolMsg = await this.createToolMessage(toolCall, mcpConfig)
      chat.messages.push(toolMsg)
    }
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
      toolMsg.content = result
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
