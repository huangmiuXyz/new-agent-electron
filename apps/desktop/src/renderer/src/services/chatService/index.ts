import {
  generateText as _generateText,
  generateImage as _generateImage,
  experimental_generateVideo as _generateVideo,
  ToolLoopAgent,
  ToolChoice,
  wrapLanguageModel,
  streamText as _streamText,
  convertToModelMessages,
  validateUIMessages,
  type DataContent
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'
import { buildSkillsPrompt, discoverSkills } from '../skillsService'
import { createRagMiddleware } from './middleware/rags'
import { createContextLimitMiddleware } from './middleware/contextLimit'
import { createCompressContextMiddleware } from './middleware/compressContext'
import { createUsageGuardMiddleware } from './middleware/usageGuard'
import { createSkillReferenceMiddleware } from './middleware/skillReferences'
import { normalizeInlineFilePartUrls, sanitizeUIMessages } from './utils'
import { useSettingsStore } from '@renderer/stores/settings'
import { createToolMiddleware } from './middleware/createToolMiddleware'
import {
  buildCodexEnvironmentPrompt,
  buildContextCompressionPrompt,
  buildMultiAgentSystemPrompt,
  buildTranslationPrompt
} from './systemPrompts'
import { estimateMessagesTokens, serializeMessageForTokenEstimation } from './tokenUsage'

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
  builtinToolsRequireApproval?: string[]
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
  contextTokenCount?: number
  autoCompressContext?: boolean
  compressModel?: { providerId: string; modelId: string }
  maxToolCalls?: number
  providerOptions?: Record<string, any>
  onBeforeToolExecute?: (params: { tool: Tool; input: string; options: any }) => Promise<void>
  isApprovalAction?: boolean
  abortSignal?: AbortSignal
}

export type GenerateImagePrompt =
  | string
  | {
    images: Array<DataContent>
    text?: string
    mask?: DataContent
  }

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
  contextTokenCount?: number
  compressModel?: { providerId: string; modelId: string }
  activeModel?: string
}

type CompressionMetaData = MetaData & {
  compressedUpToIndex?: number
}

const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'
const MESSAGE_HEADROOM_AFTER_COMPRESSION = 2
const TOKEN_HEADROOM_RATIO_AFTER_COMPRESSION = 0.2

const cleanProviderOptions = (value: any): any => {
  if (Array.isArray(value)) {
    const cleanedArray = value
      .map((item) => cleanProviderOptions(item))
      .filter((item) => item !== undefined)
    return cleanedArray.length > 0 ? cleanedArray : undefined
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value)
      .map(([key, nestedValue]) => [key, cleanProviderOptions(nestedValue)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined)

    return cleanedEntries.length > 0 ? Object.fromEntries(cleanedEntries) : undefined
  }

  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  return value
}

const isCompressedContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    message.role === 'system' &&
    message.parts?.some(
      (part) => part.type === 'text' && part.text?.includes(COMPRESSED_CONTEXT_MARKER)
    )
  )
}

const isCompressingContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    (message.metadata as { isCompressingContext?: boolean } | undefined)?.isCompressingContext
  )
}

const serializeMessageForCompression = (message: BaseMessage): string => {
  return serializeMessageForTokenEstimation(message)
}

const getCompressionBoundaryTailMessages = (
  messages: BaseMessage[],
  compressedUpToIndex?: number
): BaseMessage[] => {
  const visibleMessages = messages.filter((message) => !isCompressingContextMessage(message))
  const baseMessages = visibleMessages.filter((message) => !isCompressedContextMessage(message))

  if (compressedUpToIndex == null || compressedUpToIndex < 0) {
    return baseMessages.filter((message) => message.role !== 'system')
  }

  if (compressedUpToIndex < baseMessages.length) {
    return baseMessages
      .slice(compressedUpToIndex + 1)
      .filter((message) => message.role !== 'system')
  }

  const latestCompressedMessageIndex = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (isCompressedContextMessage(visibleMessages[i])) {
        return i
      }
    }

    return -1
  })()

  if (latestCompressedMessageIndex === -1) {
    return []
  }

  return visibleMessages
    .slice(latestCompressedMessageIndex + 1)
    .filter((message) => message.role !== 'system' && !isCompressedContextMessage(message))
}

const normalizeCompressedMessages = (
  messages: BaseMessage[],
  compressedMessage: BaseMessage,
  _options: { recentMessageCount?: number; recentTokenCount?: number; model?: string }
): BaseMessage[] => {
  const baseMessages = messages.filter(
    (message) => !isCompressedContextMessage(message) && !isCompressingContextMessage(message)
  )
  return [...baseMessages, compressedMessage]
}

const autoCompressContext = async (options: AutoCompressOptions): Promise<BaseMessage[]> => {
  const { cid, messages, contextCount, contextTokenCount, compressModel, activeModel } = options
  const { getChatById } = useChatsStores()
  const chat = getChatById(cid)
  const persistedMessages = chat?.messages ?? messages
  const persistedBaseMessages = persistedMessages.filter(
    (message) => !isCompressingContextMessage(message) && !isCompressedContextMessage(message)
  )
  const compressedContext = chat?.compressedContext
  const compressedBoundaryIndex = compressedContext?.compressedUpToIndex

  const preservedSystemCount = persistedBaseMessages.filter(
    (message) => message.role === 'system'
  ).length
  const recentMessageCount =
    contextCount && contextCount > 1
      ? Math.max(
        1,
        Math.min(
          Math.max(1, Math.floor((contextCount - preservedSystemCount - 1) / 2)),
          contextCount - preservedSystemCount - 1 - MESSAGE_HEADROOM_AFTER_COMPRESSION
        )
      )
      : undefined
  const recentTokenCount =
    contextTokenCount && contextTokenCount > 1
      ? Math.max(1, Math.floor(contextTokenCount * (1 - TOKEN_HEADROOM_RATIO_AFTER_COMPRESSION)))
      : undefined
  const hasPriorSummary = Boolean(compressedContext?.content)
  const unsummarizedTailMessages = getCompressionBoundaryTailMessages(
    persistedMessages,
    compressedBoundaryIndex
  )
  const messageThresholdReached = hasPriorSummary
    ? Boolean(contextCount && unsummarizedTailMessages.length > contextCount)
    : Boolean(contextCount && persistedBaseMessages.length > contextCount)
  const tokenThresholdReached = hasPriorSummary
    ? Boolean(
      contextTokenCount &&
      estimateMessagesTokens(unsummarizedTailMessages, activeModel) > contextTokenCount
    )
    : Boolean(
      contextTokenCount &&
      estimateMessagesTokens(persistedBaseMessages, activeModel) > contextTokenCount
    )

  const shouldAutoCompress =
    (messageThresholdReached || tokenThresholdReached) &&
    compressModel?.providerId &&
    compressModel?.modelId

  if (!shouldAutoCompress) return messages

  const compressProvider = useSettingsStore().getProviderById(compressModel.providerId)
  if (!compressProvider) return messages

  try {
    const compressionWindow = {
      recentMessageCount,
      recentTokenCount,
      model: activeModel
    }
    const meaningfulMessagesToCompress = hasPriorSummary
      ? unsummarizedTailMessages
      : persistedBaseMessages.filter((message) => {
        return message.role !== 'system' || Boolean(serializeMessageForCompression(message))
      })

    if (hasPriorSummary && meaningfulMessagesToCompress.length === 0) return messages
    if (!hasPriorSummary && meaningfulMessagesToCompress.length === 0) return messages

    const lastCompressedIndex = (() => {
      for (let i = persistedBaseMessages.length - 1; i >= 0; i--) {
        if (persistedBaseMessages[i].role !== 'system') {
          return i
        }
      }

      return undefined
    })()

    const compressedPrefix = compressedContext?.content?.trim()
    const newTailContext = meaningfulMessagesToCompress
      .map((message) => serializeMessageForCompression(message))
      .filter(Boolean)
      .join('\n\n')
    const contextToCompress = [compressedPrefix, newTailContext].filter(Boolean).join('\n\n')

    if (!contextToCompress) return messages

    const { updateMessages, updateMessage, updateMessageMetadata } = useChatsStores()

    const compressingMessageId = nanoid()
    const compressingMessage: BaseMessage = {
      id: compressingMessageId,
      role: 'system',
      parts: [
        {
          type: 'text',
          text: '🔃 正在压缩上下文...'
        }
      ],
      metadata: {
        isCompressingContext: true,
        date: Date.now(),
        provider: compressProvider.id,
        model: compressModel.modelId,
        stop: () => { },
        loading: true,
        cid,
        compressedUpToIndex: lastCompressedIndex
      } as CompressionMetaData
    }

    if (chat) {
      chat.compressedContext = {
        content: compressedContext?.content || '',
        compressedUpToIndex: compressedBoundaryIndex,
        updatedAt: Date.now(),
        provider: compressProvider.id,
        model: compressModel.modelId,
        loading: true
      }
      updateMessages(cid, (msgs) =>
        normalizeCompressedMessages(msgs, compressingMessage, compressionWindow)
      )
    }

    let compressedText = ''

    const compressStream = _streamText({
      model: createRegistry({
        apiKey: compressProvider.apiKey || '',
        baseURL: compressProvider.baseUrl,
        name: compressProvider.name
      }).languageModel(`${compressProvider.providerType}:${compressModel.modelId}`),
      prompt: buildContextCompressionPrompt(contextToCompress),
      onFinish: ({ text }) => {
        compressedText = text
      }
    })

    let accumulatedText = ''
    try {
      for await (const data of compressStream.textStream) {
        accumulatedText += data
        if (chat) {
          updateMessage(cid, compressingMessageId, [
            {
              type: 'text',
              text: `🔃 正在压缩上下文...\n\n${accumulatedText}`
            }
          ])
        }
      }

      if (chat && compressedText) {
        chat.compressedContext = {
          content: compressedText,
          compressedUpToIndex: lastCompressedIndex,
          updatedAt: Date.now(),
          provider: compressProvider.id,
          model: compressModel.modelId,
          loading: false
        }
        updateMessage(cid, compressingMessageId, [
          {
            type: 'text',
            text: `${compressedText}\n\n${COMPRESSED_CONTEXT_MARKER}`
          }
        ])
      }

      if (chat) {
        const msg = chat.messages.find((m) => m.id === compressingMessageId)
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
      if (chat) {
        chat.compressedContext = compressedContext
          ? { ...compressedContext, loading: false }
          : undefined
        updateMessage(cid, compressingMessageId, [
          {
            type: 'text',
            text: accumulatedText + '\n\n❌ 压缩过程出错，将使用原始上下文继续。'
          }
        ])
        const errorMsg = chat.messages.find((m) => m.id === compressingMessageId)
        if (errorMsg && errorMsg.metadata) {
          const newMetadata = { ...errorMsg.metadata, loading: false } as MetaData
          updateMessageMetadata(cid, compressingMessageId, newMetadata)
        }
      }
      return messages
    }

    if (compressedText && chat) {
      const compressingMsg = chat.messages.find((m) => m.id === compressingMessageId)
      if (compressingMsg) {
        return messages
      }
    }

    return messages
  } catch (error) {
    console.error('自动压缩上下文失败:', error)
    return messages
  }
}
const shouldStopForToolResult = (toolResult: { toolName?: string; output: unknown }): boolean => {
  return Boolean((toolResult.output as any)?.queueAsUserMessage)
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
      builtinToolsRequireApproval,
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
      contextTokenCount,
      autoCompressContext: shouldAutoCompress,
      compressModel,
      maxToolCalls,
      providerOptions: customProviderOptions,
      onBeforeToolExecute,
      isApprovalAction,
      abortSignal
    }: ChatServiceConfig
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })

    // 自动压缩上下文
    if (shouldAutoCompress) {
      messages = await autoCompressContext({
        cid,
        messages,
        contextCount,
        contextTokenCount,
        compressModel,
        activeModel: model
      })
    }

    let tools: Tools = {}

    const hasLoadSkillTool = !!selectedBuiltinTools?.includes('loadSkill')
    const skills = discoverSkills(undefined, { chatId: cid })
    const builtinTools = getBuiltinTools({ knowledgeBaseIds, skills })
    const skillsPrompt = hasLoadSkillTool ? buildSkillsPrompt(skills, cid) : ''
    const currentChat = useChatsStores().getChatById(cid)
    const agentWorkPath = useCanvasStore().getWorkPath(cid) || undefined
    const isSubAgentChat = !!currentChat?.parentChatId
    const assignedBuiltinTools = selectedBuiltinTools || []
    const hasAssignedAgentTools = assignedBuiltinTools.some(
      (toolName) => toolName === 'delegate_to_sub_agent' || toolName === 'agent_communicate'
    )
    const multiAgentPrompt =
      hasAssignedAgentTools || isSubAgentChat ? buildMultiAgentSystemPrompt(cid) : ''
    const codexEnvironmentPrompt = buildCodexEnvironmentPrompt(cid, selectedBuiltinTools)
    const agentInstructions =
      [codexEnvironmentPrompt, instructions?.trim(), skillsPrompt, multiAgentPrompt].filter(Boolean).join('\n\n') ||
      undefined

    const builtinToolKeys = new Set<string>(selectedBuiltinTools || [])
    const builtinToolApprovalKeys = new Set<string>(builtinToolsRequireApproval || [])
    if (isSubAgentChat) {
      builtinToolKeys.add('agent_communicate')
    }

    if (builtinToolKeys.size > 0) {
      builtinToolKeys.forEach((toolKey) => {
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
    let ragSearchDetails:
      | Array<{ knowledgeBaseId: string; documentId: string; score?: number }>
      | undefined

    const controller = new AbortController()
    if (abortSignal) {
      if (abortSignal.aborted) {
        controller.abort()
      } else {
        abortSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }
    const wrappedTools = Object.fromEntries(
      Object.entries(tools).map(([toolName, t]) => {
        const isConfiguredBuiltinTool = builtinToolKeys.has(toolName)
        const needsConfiguredApproval =
          isConfiguredBuiltinTool && builtinToolApprovalKeys.has(toolName)

        const needsApproval =
          toolName === 'multi_tool_use_parallel' && isConfiguredBuiltinTool
            ? (input: unknown) => {
              if (needsConfiguredApproval) return true

              const toolUses = (input as { tool_uses?: Array<{ recipient_name?: string }> })?.tool_uses
              if (!Array.isArray(toolUses)) return false

              return toolUses.some((toolUse) => {
                const recipientName = toolUse?.recipient_name || ''
                if (!recipientName.startsWith('builtin.')) return false
                const nestedToolName = recipientName.slice('builtin.'.length)
                return builtinToolApprovalKeys.has(nestedToolName)
              })
            }
            : needsConfiguredApproval

        return [
          toolName,
          {
            ...t,
            needsApproval,
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
          }
        ]
      })
    )
    const buildOpenAICompatibleTransformRequestBody = (transformRequestBody?: string) => {
      if (!transformRequestBody?.trim()) return undefined

      try {
        const parsed = JSON.parse(transformRequestBody)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          console.warn('transformRequestBody 必须是 JSON 对象字符串')
          return undefined
        }

        return (args: Record<string, any>) => ({
          ...args,
          ...parsed
        })
      } catch (error) {
        console.warn('transformRequestBody JSON 解析失败:', error)
        return undefined
      }
    }

    const transformRequestBody = buildOpenAICompatibleTransformRequestBody(customProviderOptions?.transformRequestBody)


    const { transformRequestBody: _transformRequestBody, ...runtimeProviderOptions } =
      customProviderOptions || {}

    const supportsThinkingToggle = providerType === 'anthropic' || providerType === 'deepseek'

    const mergedProviderOptions =
      cleanProviderOptions({
        ...(supportsThinkingToggle &&
          thinkingMode !== undefined && {
          thinking: {
            type: thinkingMode ? 'enabled' : 'disabled'
          },
          enable_thinking: thinkingMode
        }),
        ...runtimeProviderOptions
      }) || {}

    const agent = new ToolLoopAgent({
      model: wrapLanguageModel({
        model: createRegistry({
          apiKey,
          baseURL,
          name: provider,
          transformRequestBody
        }).languageModel(`${providerType}:${model}`),
        middleware: [
          createUsageGuardMiddleware(),
          createToolMiddleware(),
          createCompressContextMiddleware({ cid, contextCount }),
          createContextLimitMiddleware({ contextCount }),
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchComplete: (details) => {
              ragSearchDetails = details?.map((item) => ({ ...item }))
            }
          }),
          createSkillReferenceMiddleware({ skills, workPath: agentWorkPath })
        ]
      }),
      providerOptions: {
        [providerType]: mergedProviderOptions
      },
      tools: wrappedTools,
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens: maxOutputTokens || undefined,
      instructions: agentInstructions,
      stopWhen: [
        ({ steps }) => {
          const maxSteps = maxToolCalls || 50
          return (
            steps.length >= maxSteps ||
            (steps.some((step) =>
              step.toolResults?.some((toolResult) => {
                return shouldStopForToolResult({
                  toolName: toolResult.toolName,
                  output: toolResult.output
                })
              })
            ) ??
              false)
          )
        }
      ]
    })

    // 1. Validate UI messages
    const validatedMessages = await validateUIMessages({
      messages,
      tools: agent.tools
    })

    // 2. 清洗数据：移除历史中没有结果的工具调用，防止模型报错
    const sanitizedMessages = sanitizeUIMessages(validatedMessages, {
      isManualApproval: isApprovalAction || false
    })

    const normalizedMessages = normalizeInlineFilePartUrls(sanitizedMessages)

    // 3. Convert to model messages
    const modelMessages = await convertToModelMessages(normalizedMessages, {
      tools: agent.tools
    })

    const estimatedPromptTokens = estimateMessagesTokens(messages, model)

    const result = await agent.stream({
      prompt: modelMessages,
      abortSignal: controller.signal
    })

    const uiStream = result.toUIMessageStream({
      originalMessages: validatedMessages,
      messageMetadata: ({ part }) => {
        let finishMetadata = {}
        if (part.type === 'finish-step' && part.finishReason === 'stop') {
          finishMetadata = {
            usage: part.usage,
            providerMetadata: part.providerMetadata!
          }
        }
        return {
          loading: part.type !== 'finish' && part.type !== 'abort',
          provider,
          date: Date.now(),
          model,
          cid,
          estimatedInputTokens: estimatedPromptTokens,
          stop: () => controller.abort(),
          ragSearchDetails: ragSearchDetails?.map((item) => ({ ...item })),
          ragEnabled,
          ...finishMetadata
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
        toolChoice,
        frequencyPenalty: 2
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
    }: ChatServiceOptions & { onData: (text: string) => void; onFinish: () => void }
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
    const prompt = buildTranslationPrompt(text, targetLanguage)
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
    const listModelsResult = await providerInstance.listModels?.()
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
