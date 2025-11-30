import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
import { HumanMessage, AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { nanoid } from '../utils/nanoid'
import { LLMFactory } from '../core/llmFactory'
import { runAgentLoop } from '../core/agentRunner'
import type { ContentBlock } from 'langchain'
import { MCPService } from '@renderer/core/mcpService'

export const useLangChain = () => {
  const settings = useSettingsStore()
  const chatStore = useChatsStores()

  const createAndPushAIMessage = (chatId: string, provider: Provider, model: Model) => {
    const chat = chatStore.getChatById(chatId)!
    const content = reactive<ContentBlock.Text[]>([{ type: 'text', text: '' }])
    const additional_kwargs = reactive({
      reasoning_content: '',
      provider,
      model
    })

    const aiMsgId = nanoid()
    const aiMsg = new AIMessage({
      id: aiMsgId,
      content,
      additional_kwargs,
      tool_calls: []
    })
    chat.messages.push(aiMsg)
    return { aiMsg, content, additional_kwargs }
  }

  const _generateResponse = async (
    messages: BaseMessage[],
    chatId: string,
    recursionLimit: number = 5
  ) => {
    const { provider, model } = settings.getModelById(
      settings.currentSelectedProvider!.id,
      settings.currentSelectedModel!.id
    )!

    const client = LLMFactory.create({ provider, model })
    const { aiMsg, content, additional_kwargs } = createAndPushAIMessage(chatId, provider, model)

    await runAgentLoop({
      client,
      messages,
      mcpConfig: { mcpServers: settings.mcpServers },
      recursionLimit,
      onToken: (chunk: AIMessageChunk, aggregated: AIMessageChunk) => {
        if (chunk.content) {
          if (typeof chunk.content === 'string') {
            content[0].text += chunk.content
          } else if (Array.isArray(chunk.content)) {
            chunk.content.forEach((c) => {
              if (c.type === 'text') content[0].text += c.text
            })
          }
        }
        const reasoning = chunk.additional_kwargs?.reasoning_content as string
        if (reasoning) {
          additional_kwargs.reasoning_content += reasoning
        }
        if (aggregated.tool_calls && aggregated.tool_calls.length > 0) {
          aiMsg.tool_calls = aggregated.tool_calls
        }
      },
      onError: (error) => {
        console.error('生成失败:', error)
        content[0].text += `\n[系统错误: ${error instanceof Error ? error.message : String(error)}]`
        chatStore.$persist()
      }
    })
    chatStore.$persist()
  }

  const chatStream = async (input: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const userMsg = new HumanMessage({ id: nanoid(), content: input })
    chat.messages.push(userMsg)

    const chatHistory = new InMemoryChatMessageHistory(chat.messages)
    const historyMessages = await chatHistory.getMessages()

    await _generateResponse(historyMessages, chatId)
  }

  const regenerate = async (messageId: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const index = chat.messages.findIndex((m) => m.id === messageId)
    if (index === -1) return

    const targetMessage = chat.messages[index]
    chat.messages = AIMessage.isInstance(targetMessage)
      ? chat.messages.slice(0, index)
      : chat.messages.slice(0, index + 1)

    const chatHistory = new InMemoryChatMessageHistory(chat.messages)
    const contextMessages = await chatHistory.getMessages()
    if (contextMessages.length === 0) return

    await _generateResponse(contextMessages, chatId)
  }

  return {
    chatStream,
    regenerate,
    list_models: LLMFactory.listModels,
    getMcpTools: MCPService.getTools,
    call_tools: MCPService.callTool
  }
}
