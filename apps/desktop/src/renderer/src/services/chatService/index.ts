import {
  generateText as _generateText,
  generateImage as _generateImage,
  ToolLoopAgent,
  ToolChoice,
  wrapLanguageModel,
  createAgentUIStream,
  streamText as _streamText,
  isToolUIPart
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'
import { createRagMiddleware } from './middleware/rags'
import { createContextLimitMiddleware } from './middleware/contextLimit'
import { createCompressContextMiddleware } from './middleware/compressContext'
import { useSettingsStore } from '@renderer/stores/settings'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  providerType: providerType
  tools?: any
  toolChoice?: ToolChoice<any>
}

interface ChatServiceConfig {
  mcpClient: ClientConfig
  instructions?: string
  mcpTools?: string[]
  builtinTools?: string[]
  knowledgeBaseIds?: string[]
  thinkingMode?: boolean
  ragEnabled?: boolean
  temperature?: number
  topP?: number
  topK?: number
  presencePenalty?: number
  frequencyPenalty?: number
  maxOutputTokens?: number
  contextCount?: number
  autoCompressContext?: boolean
  compressModel?: { providerId: string; modelId: string }
  providerOptions?: Record<string, any>
  onBeforeToolExecute?: (params: { tool: Tool; input: string; options: any }) => Promise<void>
  skipAutoApprove?: boolean
}

export interface ImageGenerateOptions {
  n?: number
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: any
}
const processMessagesWithToolOutput = (messages: BaseMessage[], skipAutoApprove?: boolean): BaseMessage[] => {
  const processedMessages = JSON.parse(JSON.stringify(messages)) as BaseMessage[]
  for (const message of processedMessages) {
    if (message.parts && Array.isArray(message.parts)) {
      message.parts = message.parts.map((part) => {
        if (!isToolUIPart(part)) {
          return part
        }
        if (!part.output && !skipAutoApprove) {
          const newPart: any = { ...part }
          delete newPart.title
          newPart.state = 'output-available'
          if (newPart.approval !== undefined && newPart.approval.approved === undefined) {
            newPart.approval = { ...newPart.approval, approved: true }
          }
          if (newPart.output === undefined) {
            newPart.output = {
              toolResult: {
                content: [{ type: 'text', text: '' }]
              }
            }
          }
          return newPart
        }
        return part
      })
    }
  }
  return processedMessages
}

interface AutoCompressOptions {
  cid: string
  messages: BaseMessage[]
  contextCount?: number
  compressModel?: { providerId: string; modelId: string }
}

const autoCompressContext = async (options: AutoCompressOptions): Promise<BaseMessage[]> => {
  const { cid, messages, contextCount, compressModel } = options

  // 当消息数量达到或超过上下文限制时触发压缩
  const shouldAutoCompress = contextCount &&
    messages.length >= contextCount &&
    compressModel?.providerId &&
    compressModel?.modelId

  if (!shouldAutoCompress) return messages

  // 检查是否已经有压缩标记
  const hasCompressed = messages.some(m =>
    m.role === 'system' &&
    m.parts?.some(p => p.type === 'text' && p.text?.includes('[上下文已压缩]'))
  )

  if (hasCompressed) return messages

  const compressProvider = useSettingsStore().getProviderById(compressModel.providerId)
  if (!compressProvider) return messages

  try {
    // 构建需要压缩的上下文
    const contextToCompress = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const text = m.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') || ''
        return `${m.role}: ${text}`
      })
      .join('\n\n')

    const { updateMessages, getChatById, updateMessage, updateMessageMetadata } = useChatsStores()

    // 创建system消息显示压缩进度
    const compressingMessageId = nanoid()
    const compressingMessage: BaseMessage = {
      id: compressingMessageId,
      role: 'system',
      parts: [{
        type: 'text',
        text: '🔃 正在压缩上下文...'
      }],
      metadata: {
        isCompressingContext: true,
        date: Date.now(),
        provider: compressProvider.id,
        model: compressModel.modelId,
        stop: () => { },
        loading: true,
        cid
      } as MetaData
    }

    // 添加system消息到聊天
    const chat = getChatById(cid)
    if (chat) {
      updateMessages(cid, (msgs) => [...msgs, compressingMessage])
    }

    let compressedText = ''

    // 流式生成压缩内容
    const compressStream = _streamText({
      model: createRegistry({
        apiKey: compressProvider.apiKey || '',
        baseURL: compressProvider.baseUrl,
        name: compressProvider.name
      }).languageModel(`${compressProvider.providerType}:${compressModel.modelId}`),
      prompt: `请将以下对话历史压缩成简洁的摘要，保留关键信息和结论：

${contextToCompress}

请生成一个简洁的摘要，包含：
1. 讨论的主要话题
2. 关键决策和结论
3. 需要记住的重要信息
4. 未解决的问题（如果有）`,
      onFinish: ({ text }) => {
        compressedText = text
      }
    })

    // 流式接收内容并实时更新system消息
    let accumulatedText = ''
    try {
      for await (const data of compressStream.textStream) {
        accumulatedText += data
        if (chat) {
          // 实时更新system消息显示流式进度（临时显示，不包含标记）
          updateMessage(cid, compressingMessageId, [{
            type: 'text',
            text: `🔃 正在压缩上下文...\n\n${accumulatedText}`
          }])
        }
      }

      // 流式完成，更新为最终状态（包含[上下文已压缩]标记供中间件识别）
      if (chat && compressedText) {
        // 先更新为带标记的文本
        updateMessage(cid, compressingMessageId, [{
          type: 'text',
          text: `${compressedText}\n\n[上下文已压缩]`
        }])
        // 标记为非加载状态 - 使用 updateMessageMetadata 确保状态被正确保存
        const msg = chat.messages.find(m => m.id === compressingMessageId)
        if (msg && msg.metadata) {
          const newMetadata = { ...msg.metadata, loading: false, isCompressedContext: true } as MetaData
          updateMessageMetadata(cid, compressingMessageId, newMetadata)
        }
      }
    } catch (streamError) {
      console.error('流式压缩出错:', streamError)
      // 流式出错时，显示错误
      if (chat) {
        updateMessage(cid, compressingMessageId, [{
          type: 'text',
          text: accumulatedText + '\n\n❌ 压缩过程出错，将使用原始上下文继续。'
        }])
        // 标记为非加载状态
        const errorMsg = chat.messages.find(m => m.id === compressingMessageId)
        if (errorMsg && errorMsg.metadata) {
          const newMetadata = { ...errorMsg.metadata, loading: false } as MetaData
          updateMessageMetadata(cid, compressingMessageId, newMetadata)
        }
      }
      return messages
    }

    // 压缩完成，返回包含system消息的消息列表（system消息已在UI中显示）
    if (compressedText && chat) {
      // 找到刚刚创建的system消息并返回
      const compressingMsg = chat.messages.find(m => m.id === compressingMessageId)
      if (compressingMsg) {
        return [...messages, compressingMsg]
      }
    }

    return messages
  } catch (error) {
    console.error('自动压缩上下文失败:', error)
    return messages
  }
}

export const chatService = () => {
  const createAgent = async (
    cid: string,
    { model, apiKey, baseURL, provider, providerType }: ChatServiceOptions,
    messages: BaseMessage[],
    {
      mcpClient,
      instructions,
      mcpTools,
      builtinTools: selectedBuiltinTools,
      knowledgeBaseIds,
      thinkingMode,
      ragEnabled,
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens,
      contextCount,
      autoCompressContext: shouldAutoCompress,
      compressModel,
      providerOptions: customProviderOptions,
      onBeforeToolExecute,
      skipAutoApprove
    }: ChatServiceConfig
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })

    // 自动压缩上下文
    if (shouldAutoCompress) {
      messages = await autoCompressContext({
        cid,
        messages,
        contextCount,
        compressModel
      })
    }

    let tools: Tools = {}

    const builtinTools = getBuiltinTools({ knowledgeBaseIds })

    if (selectedBuiltinTools && selectedBuiltinTools.length > 0) {
      selectedBuiltinTools.forEach((toolKey) => {
        if (toolKey in builtinTools) {
          tools[toolKey] = builtinTools[toolKey]
        }
      })
    }

    if (mcpTools && mcpTools.length > 0) {
      const close = messageApi.loading('连接mcp服务器中...')
      try {
        const allTools = await list_tools(JSON.parse(JSON.stringify(mcpClient)))
        mcpTools.forEach((toolKey) => {
          const key = toolKey.split('.')[1]
          if (key && allTools[key]) {
            tools[key] = allTools[key]
          }
        })
      } catch (error) {
        messageApi.error((error as Error).message)
      } finally {
        close()
      }
    }
    const ragSearchDetails = ref()

    const agent = new ToolLoopAgent({
      model: wrapLanguageModel({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        middleware: [
          createCompressContextMiddleware(),
          createContextLimitMiddleware({ contextCount }),
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchComplete: (details) => {
              ragSearchDetails.value = details
            }
          })
        ]
      }),
      providerOptions: {
        [providerType]: {
          ...(thinkingMode !== undefined && {
            thinking: {
              type: thinkingMode ? 'enabled' : 'disabled'
            }
          }),
          ...customProviderOptions
        }
      },
      tools: mapValues(tools, (t) => ({
        ...t,
        execute: async (input: any, options: any) => {
          await onBeforeToolExecute?.({ tool: t, input, options })
          const result = await t.execute(input, {
            ...JSON.parse(JSON.stringify(options)),
            chatId: cid,
            model,
            provider,
            abortSignal: controller.signal
          })
          return result
        }
      })),
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens,
      instructions,
      stopWhen: [
        ({ steps }) => {
          return (
            steps.some((step) =>
              step.toolResults?.some((toolResult) => {
                return JSON.stringify(toolResult.output).includes('<|stop|>')
              })
            ) ?? false
          )
        }
      ]
    })
    const controller = new AbortController()
    const processedMessages = processMessagesWithToolOutput(messages, skipAutoApprove)
    const uiStream = createAgentUIStream({
      agent,
      uiMessages: processedMessages,
      abortSignal: controller.signal,
      messageMetadata: ({ part }) => {
        let result = {}
        if (part.type === 'finish-step' && part.finishReason === 'stop') {
          result = {
            usage: part.usage,
            providerMetadata: part.providerMetadata!,
          }
        } else {
          result = {}
        }
        return {
          loading: part.type !== 'finish' && part.type !== 'abort',
          provider,
          date: Date.now(),
          model,
          cid,
          stop: () => controller.abort(),
          ragSearchDetails: ragSearchDetails.value,
          ragEnabled,
          ...result,
        }
      }
    })
    return uiStream
  }
  const generateText = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      tools,
      toolChoice = 'auto'
    }: ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const result = await _generateText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        tools,
        prompt,
        toolChoice
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }
  const streamText = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      tools,
      toolChoice = 'auto',
      onData,
      onFinish
    }: ChatServiceOptions & { onData: (text: string) => void, onFinish: () => void }
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const result = _streamText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        tools,
        prompt,
        toolChoice,
        onFinish
      })
      for await (const data of result.textStream) {
        onData(data)
      }
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const generateImage = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      n,
      size,
      aspectRatio,
      seed,
      providerOptions
    }: ImageGenerateOptions & ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const result = await _generateImage({
        model: createRegistry({ apiKey, baseURL, name: provider }).imageModel(
          `${providerType}:${model}`
        ),
        prompt,
        n,
        size: size as `${number}x${number}`,
        aspectRatio: aspectRatio as `${number}:${number}`,
        seed,
        providerOptions: {
          [providerType]: providerOptions
        }
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const translateText = async (
    text: string,
    targetLanguage: string = '中文',
    { model, apiKey, baseURL, provider, providerType }: ChatServiceOptions,
    abortSignal?: AbortSignal
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    const prompt = `请将以下文本翻译为${targetLanguage}，只返回翻译结果，不要添加任何解释或额外内容：\n\n${text}`
    try {
      const result = await _generateText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        prompt,
        abortSignal
      })
      return result.text
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }
  const list_models = async ({ baseURL, apiKey, providerType, name }) => {
    await onUseAIBefore({ providerType, apiKey, baseURL })
    const registry = createRegistry({ apiKey, baseURL, name: name || providerType })
    const providerInstance = registry.getProvider(providerType)
    const listModelsResult =
      await providerInstance.listModels?.()
    return listModelsResult || []
  }
  const list_tools = async (config: ClientConfig, cache?: boolean) => {
    try {
      const tools = await retry(
        async () => {
          return await window.api.list_tools(config, cache)
        },
        {
          retries: 3,
          delay: 100
        }
      )
      return tools
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }
  return {
    createAgent,
    list_models,
    list_tools,
    generateText,
    streamText,
    translateText,
    generateImage
  }
}
