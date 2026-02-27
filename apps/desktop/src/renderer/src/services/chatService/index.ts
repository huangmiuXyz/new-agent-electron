import {
  generateText as _generateText,
  generateImage as _generateImage,
  experimental_generateVideo as _generateVideo,
  ToolChoice,
  wrapLanguageModel,
  streamText as _streamText,
  convertToModelMessages,
  validateUIMessages,
  type DataContent,
  readUIMessageStream,
  stepCountIs
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'
import { buildSkillsPrompt, discoverSkills } from '../skillsService'
import { createRagMiddleware } from './middleware/rags'
import { createContextLimitMiddleware } from './middleware/contextLimit'
import { createCompressContextMiddleware } from './middleware/compressContext'
import { sanitizeUIMessages } from './utils'
import { useSettingsStore } from '@renderer/stores/settings'
import { createToolMiddleware } from './middleware/createToolMiddleware'


interface VideoGenerateOptions {
  n?: number
  duration?: number
  resolution?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: any
}
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
  isApprovalAction?: boolean
  onMessage?: (message: BaseMessage) => void
  abortSignal?: AbortSignal
  responseMessageId?: string
  isRegenerateAction?: boolean
}

export type GenerateImagePrompt = string | {
  images: Array<DataContent>;
  text?: string;
  mask?: DataContent;
};

export interface ImageGenerateOptions {
  n?: number
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: any
}

interface AutoCompressOptions {
  cid: string
  messages: BaseMessage[]
  contextCount?: number
  compressModel?: { providerId: string; modelId: string }
}

const autoCompressContext = async (options: AutoCompressOptions): Promise<BaseMessage[]> => {
  const { cid, messages, contextCount, compressModel } = options

  const shouldAutoCompress = contextCount &&
    messages.length >= contextCount &&
    compressModel?.providerId &&
    compressModel?.modelId

  if (!shouldAutoCompress) return messages

  const hasCompressed = messages.some(m =>
    m.role === 'system' &&
    m.parts?.some(p => p.type === 'text' && p.text?.includes('[上下文已压缩]'))
  )

  if (hasCompressed) return messages

  const compressProvider = useSettingsStore().getProviderById(compressModel.providerId)
  if (!compressProvider) return messages

  try {
    const contextToCompress = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const text = m.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') || ''
        return `${m.role}: ${text}`
      })
      .join('\n\n')

    const { updateMessages, getChatById, updateMessage, updateMessageMetadata } = useChatsStores()

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

    const chat = getChatById(cid)
    if (chat) {
      updateMessages(cid, (msgs) => [...msgs, compressingMessage])
    }

    let compressedText = ''

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

    let accumulatedText = ''
    try {
      for await (const data of compressStream.textStream) {
        accumulatedText += data
        if (chat) {
          updateMessage(cid, compressingMessageId, [{
            type: 'text',
            text: `🔃 正在压缩上下文...\n\n${accumulatedText}`
          }])
        }
      }

      if (chat && compressedText) {
        updateMessage(cid, compressingMessageId, [{
          type: 'text',
          text: `${compressedText}\n\n[上下文已压缩]`
        }])
      }

      if (chat) {
        const msg = chat.messages.find(m => m.id === compressingMessageId)
        if (msg && msg.metadata) {
          const newMetadata = {
            ...msg.metadata,
            loading: false,
            ...(compressedText ? { isCompressedContext: true } : {})
          } as MetaData
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

    if (compressedText && chat) {
      const compressingMsg = chat.messages.find(m => m.id === compressingMessageId)
      if (compressingMsg) {
        if (messages.length === 0) return [compressingMsg]

        const insertAt = Math.max(messages.length - 1, 0)
        const mergedMessages = [...messages]
        mergedMessages.splice(insertAt, 0, compressingMsg)
        return mergedMessages
      }
    }

    return messages
  } catch (error) {
    console.error('自动压缩上下文失败:', error)
    return messages
  }
}
const toolLoopStopSentinel = '<|stop|>'
const hasStopSentinelOutput = (output: unknown): boolean => {
  if (typeof output === 'string') {
    return output.trim() === toolLoopStopSentinel
  }

  if (!output || typeof output !== 'object') return false

  const candidates = [
    (output as any)?.toolResult?.content,
    (output as any)?.content
  ]

  for (const content of candidates) {
    if (!Array.isArray(content)) continue
    if (content.some((item) => item?.type === 'text' && item?.text === toolLoopStopSentinel)) {
      return true
    }
  }

  return false
}

const shouldStopForToolResult = (toolResult: { toolName?: string; output: unknown }): boolean => {
  if (toolResult.toolName !== 'candidateReplies') return false
  return hasStopSentinelOutput(toolResult.output)
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
      isApprovalAction,
      onMessage,
      abortSignal,
      responseMessageId,
      isRegenerateAction,
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

    const hasLoadSkillTool = !!selectedBuiltinTools?.includes('loadSkill')
    const skills = hasLoadSkillTool ? discoverSkills() : []
    const builtinTools = getBuiltinTools({ knowledgeBaseIds, skills })
    const skillsPrompt = hasLoadSkillTool ? buildSkillsPrompt(skills) : ''
    const agentInstructions = [instructions?.trim(), skillsPrompt].filter(Boolean).join('\n\n') || undefined

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
    let ragSearchDetails: Array<{ knowledgeBaseId: string; documentId: string; score?: number }> | undefined
    let ragSearchDetailsVersion = 0

    const controller = new AbortController()
    if (abortSignal) {
      if (abortSignal.aborted) {
        controller.abort()
      } else {
        abortSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }
    const wrappedTools = mapValues(tools, (t) => ({
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
    }))

    const validatedMessages = await validateUIMessages({
      messages,
      tools: wrappedTools,
    })

    const sanitizedMessages = sanitizeUIMessages(validatedMessages, {
      isManualApproval: isApprovalAction || false
    })

    const modelMessages = await convertToModelMessages(sanitizedMessages, {
      tools: wrappedTools,
    })

    const metadataByChunk = (part: {
      type: 'start' | 'finish-step' | 'finish' | 'abort'
      finishReason?: string
      usage?: any
      providerMetadata?: any
    }, options?: { includeStop?: boolean }) => {
      const includeStop = options?.includeStop ?? true
      let result = {}
      if (part.type === 'finish-step' && part.finishReason === 'stop') {
        result = {
          usage: part.usage,
          providerMetadata: part.providerMetadata!,
        }
      }
      return {
        loading: part.type !== 'finish' && part.type !== 'abort',
        provider,
        date: Date.now(),
        model,
        cid,
        ...(includeStop ? { stop: () => controller.abort() } : {}),
        ragEnabled,
        ...result,
      }
    }
    const createMessageMetadata = (includeStop: boolean) => {
      let emittedRagSearchDetailsVersion = 0

      return ({ part }: { part: any }) => {
        const baseMetadata = part.type === 'finish-step'
          ? metadataByChunk({
            type: 'finish-step',
            finishReason: part.finishReason,
            usage: part.usage,
            providerMetadata: part.providerMetadata
          }, { includeStop })
          : part.type === 'finish'
            ? metadataByChunk({
              type: 'finish',
              finishReason: part.finishReason,
            }, { includeStop })
            : part.type === 'abort'
              ? metadataByChunk({ type: 'abort' }, { includeStop })
              : metadataByChunk({ type: 'start' }, { includeStop })

        const shouldAttachRagDetails =
          ragSearchDetailsVersion > emittedRagSearchDetailsVersion

        if (!shouldAttachRagDetails) return baseMetadata

        emittedRagSearchDetailsVersion = ragSearchDetailsVersion
        return {
          ...baseMetadata,
          ragSearchDetails: ragSearchDetails?.map((item) => ({ ...item }))
        }
      }
    }

    const streamResult = _streamText({
      model: wrapLanguageModel({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        middleware: [
          createToolMiddleware(),
          createCompressContextMiddleware(),
          createContextLimitMiddleware({ contextCount }),
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchComplete: (details) => {
              ragSearchDetails = details?.map((item) => ({ ...item }))
              ragSearchDetailsVersion += 1
            }
          })
        ]
      }),
      messages: modelMessages,
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
      tools: wrappedTools,
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens: maxOutputTokens || undefined,
      system: agentInstructions,
      stopWhen: [
        stepCountIs(20),
        ({ steps }) => {
          return (
            steps.some((step) =>
              step.toolResults?.some((toolResult) => {
                return shouldStopForToolResult({
                  toolName: toolResult.toolName,
                  output: toolResult.output
                })
              })
            ) ?? false
          )
        }
      ],
      abortSignal: controller.signal,
    })

    const generatedMessageId = responseMessageId || nanoid()
    const uiStreamOptions = {
      originalMessages: validatedMessages,
      generateMessageId: () => generatedMessageId,
      messageMetadata: createMessageMetadata(true)
    } as const

    const rawUiStream = streamResult.toUIMessageStream(uiStreamOptions)
    if (!onMessage) return rawUiStream

    const targetAssistantMessage = responseMessageId
      ? validatedMessages.find((message) => message.id === responseMessageId && message.role === 'assistant')
      : undefined
    const shouldUseContinuationBase = !isRegenerateAction && !!targetAssistantMessage
    const continuationBaseMessage = (shouldUseContinuationBase && targetAssistantMessage)
      ? JSON.parse(JSON.stringify(targetAssistantMessage))
      : undefined

    const mirrorStream = streamResult.toUIMessageStream({
      ...uiStreamOptions,
      messageMetadata: createMessageMetadata(false)
    })

    void (async () => {
      try {
        for await (const message of readUIMessageStream<BaseMessage>({
          message: continuationBaseMessage,
          stream: mirrorStream,
        })) {
          onMessage(message)
        }
      } catch (error) {
        console.error('onMessage stream sync failed:', error)
      }
    })()

    return rawUiStream
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
    prompt: string | GenerateImagePrompt,
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
        providerOptions
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

  const generateVideo = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      n,
      duration,
      resolution,
      aspectRatio,
      seed,
      providerOptions
    }: VideoGenerateOptions & ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const registry = createRegistry({ apiKey, baseURL, name: provider })

      // 检查 provider 是否支持 videoModel
      const providerInstance = registry.getProvider(providerType)
      if (!providerInstance || typeof (providerInstance as any).video !== 'function') {
        throw new Error(`提供商 ${providerType} 不支持视频生成`)
      }

      const result = await _generateVideo({
        model: (providerInstance as any).video(model),
        prompt,
        n,
        duration,
        resolution,
        aspectRatio: aspectRatio as `${number}:${number}`,
        seed,
        providerOptions
      })
      return result
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
    generateImage,
    generateVideo
  }
}
