import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  AIMessageChunk,
  SystemMessage,
  type BaseMessage
} from '@langchain/core/messages'
import type { ContentBlock, ToolCall } from 'langchain'
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
  const agentStore = useAgentStore()

  const _generateResponse = async (
    messages: BaseMessage[],
    chatId: string,
    recursionLimit: number = 5
  ) => {
    if (recursionLimit <= 0) {
      console.warn('达到最大工具递归调用次数，停止生成')
      return
    }

    const { provider, model } = settings.getModelById(
      settings.currentSelectedProvider!.id,
      settings.currentSelectedModel!.id
    )!
    const client = createLLMClient({ provider, model })
    const chat = chatStore.getChatById(chatId)!
    const mcpConfig = agentStore.getMcpByAgent(chat.agentId!)!
    const agent = agentStore.getAgentById(chat.agentId!)
    const tools = await getMcpTools(mcpConfig)
    const content = reactive<ContentBlock.Text[]>([{ type: 'text', text: '' }])
    const additional_kwargs = reactive<Additional_kwargs>({
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

    let aggregatedChunk = new AIMessageChunk({ content: [] })

    try {
      const runnable = client.bindTools(tools)

      let messagesToSend = messages.filter((m) => {
        if (!AIMessage.isInstance(m)) return true
        const text = Array.isArray(m.content) ? (m.content[0]?.text as string) : m.content
        const hasText = text && text.trim() !== ''
        const hasTools = m.tool_calls && m.tool_calls.length > 0
        return hasText || hasTools
      })

      if (agent && agent.systemPrompt && messagesToSend.length > 0) {
        if (!messagesToSend[0] || !SystemMessage.isInstance(messagesToSend[0])) {
          messagesToSend = [new SystemMessage({ content: agent.systemPrompt }), ...messagesToSend]
        }
      }

      const finalResponse = await runnable.invoke(messagesToSend, {
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
              if (chunk.content) {
                if (typeof chunk.content === 'string') {
                  content[0].text += chunk.content
                } else if (Array.isArray(chunk.content)) {
                  chunk.content.forEach((c) => {
                    if (c.type === 'text') content[0].text += c.text
                  })
                }
              }
              if (aggregatedChunk.tool_calls && aggregatedChunk.tool_calls.length > 0) {
                aiMsg.tool_calls = aggregatedChunk.tool_calls
              }
              const reasoning = chunk.additional_kwargs?.reasoning_content as string
              if (reasoning) {
                additional_kwargs.reasoning_content += reasoning
              }
              chatStore.$persist()
            }
          }
        ]
      })
      if (finalResponse.tool_calls && finalResponse.tool_calls.length > 0) {
        for (const toolCall of finalResponse.tool_calls) {
          const toolMsgId = nanoid()
          const toolMsg = new ToolMessage({
            id: toolMsgId,
            tool_call_id: toolCall.id!,
            name: toolCall.name,
            content: ''
          })
          chat.messages.push(toolMsg)
          chatStore.$persist()
          try {
            const result = await call_tools(toolCall as ToolCall, mcpConfig)
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
            toolMsg.content = resultStr
          } catch (error) {
            toolMsg.content = `Error: ${error instanceof Error ? error.message : String(error)}`
            toolMsg.additional_kwargs = { error: true }
          }
        }
        chatStore.$persist()
        const chatHistory = new InMemoryChatMessageHistory(chat.messages)
        const nextMessages = await chatHistory.getMessages()

        await _generateResponse(nextMessages, chatId, recursionLimit - 1)
      }
    } catch (error) {
      console.error('生成失败:', error)
      content[0].text += `\n[系统错误: ${error instanceof Error ? error.message : String(error)}]`
      chatStore.$persist()
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
    if (AIMessage.isInstance(targetMessage)) {
      chat.messages = chat.messages.slice(0, index)
    } else {
      chat.messages = chat.messages.slice(0, index + 1)
    }

    const chatHistory = new InMemoryChatMessageHistory(chat.messages)
    const contextMessages = await chatHistory.getMessages()
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

  const call_tools = async (tool_call: ToolCall, config: ClientConfig) => {
    const tools = await window.api.list_tools(JSON.parse(JSON.stringify(config)))
    const tool = tools.find((t) => t.name === tool_call.name)
    if (!tool) throw new Error(`Tool '${tool_call.name}' not found.`)
    return await tool.func(tool_call.args)
  }

  return { chatStream, regenerate, list_models, getMcpTools, call_tools }
}
