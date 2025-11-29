import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { BaseMessageChunk, ContentBlock } from 'langchain'
import { nanoid } from '../utils/nanoid'
import type {
  HandleLLMNewTokenCallbackFields,
  NewTokenIndices
} from '@langchain/core/callbacks/base'
import type { ChatGenerationChunk } from '@langchain/core/outputs'
import { ClientConfig } from '@langchain/mcp-adapters'

type LLMClient = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic | ChatDeepSeek

export const createLLMClient = ({
  provider,
  model
}: {
  provider: Provider
  model: Model
}): LLMClient => {
  const base = {
    model: model.id,
    apiKey: provider.apiKey!,
    streaming: true
  }
  switch (provider.modelType) {
    case 'deepseek':
      return new ChatDeepSeek({
        ...base,
        apiKey: provider.apiKey
      })
    case 'openai':
      return new ChatOpenAI({
        ...base,
        configuration: { baseURL: provider.baseUrl }
      })
    case 'google-genai':
      return new ChatGoogleGenerativeAI({
        ...base,
        apiKey: provider.apiKey,
        model: model.id,
        baseUrl: provider.baseUrl
      })
    case 'anthropic':
      return new ChatAnthropic({
        ...base,
        apiKey: provider.apiKey,
        anthropicApiUrl: provider.baseUrl
      })
    default:
      throw new Error(`未知的模型类型: ${provider.modelType || 'undefined'}`)
  }
}

export const useLangChain = () => {
  const settings = useSettingsStore()
  const chatStore = useChatsStores()
  const _generateResponse = async (messages: BaseMessage[], chatId: string) => {
    const { provider, model } = settings.getModelById(
      settings.currentSelectedProvider!.id,
      settings.currentSelectedModel!.id
    )!
    const client = createLLMClient({ provider, model })
    const tools = await getMcpTools({ mcpServers: settings.mcpServers })
    const chat = chatStore.getChatById(chatId)!
    const content = reactive<ContentBlock[]>([{ type: 'text', text: '' }])
    const additional_kwargs = reactive<Additional_kwargs>({
      reasoning_content: '',
      provider,
      model
    })
    const aiMsg = new AIMessage({
      id: nanoid(),
      content,
      additional_kwargs
    })
    chat.messages.push(aiMsg)
    try {
      await client.bindTools(tools).invoke(
        messages.filter((m) => {
          if (!AIMessage.isInstance(m)) return true
          const text = Array.isArray(m.content) ? (m.content[0]?.text as string) : m.content
          return text && text.trim() !== ''
        }),
        {
          callbacks: [
            {
              handleLLMNewToken: (
                token: string,
                _idx: NewTokenIndices,
                _runId: string,
                _parentRunId?: string,
                _tags?: string[],
                fields?: HandleLLMNewTokenCallbackFields
              ) => {
                content[0]!.text += token
                const message = fields?.chunk as AIMessageChunk
                const reasoning_content = message.additional_kwargs?.reasoning_content as string
                if (reasoning_content) {
                  additional_kwargs.reasoning_content += reasoning_content
                }
                chatStore.$persist()
              }
            }
          ]
        }
      )
    } catch (error) {
      console.error('生成失败:', error)
    }
  }
  const chatStream = async (input: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const userMsg = new HumanMessage({
      id: nanoid(),
      content: input
    })
    chat.messages.push(userMsg)
    const chatHistory = new InMemoryChatMessageHistory(chat.messages)
    const historyMessages = await chatHistory.getMessages()
    await _generateResponse(historyMessages, chatId)
  }
  const regenerate = async (messageId: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const index = chat.messages.findIndex((m) => m.id === messageId)
    if (index === -1) {
      console.error('未找到消息')
      return
    }
    const targetMessage = chat.messages[index]
    let contextMessages: BaseMessage[] = []
    if (AIMessage.isInstance(targetMessage)) {
      chat.messages = chat.messages.slice(0, index)
    } else {
      chat.messages = chat.messages.slice(0, index + 1)
    }
    const chatHistory = new InMemoryChatMessageHistory(chat.messages)
    contextMessages = await chatHistory.getMessages()
    if (contextMessages.length === 0) return
    await _generateResponse(contextMessages, chatId)
  }

  const list_models = async (apiKey: string, baseURL: string): Promise<{ data: Model[] }> => {
    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    return await response.json()
  }

  const getMcpTools = async (config: ClientConfig, cache: boolean = true) => {
    return await window.api.list_tools(JSON.parse(JSON.stringify(config)), cache)
  }

  const call_tools = async (name: string, args: any, config: ClientConfig) => {
    const tools = await window.api.list_tools(config)
    const tool = tools.find((t) => t.name === name)
    return await tool?.func(args)
  }

  return { chatStream, regenerate, list_models, getMcpTools, call_tools }
}
