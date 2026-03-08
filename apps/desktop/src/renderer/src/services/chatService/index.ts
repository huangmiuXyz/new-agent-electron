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
import { sanitizeUIMessages } from './utils'
import { useSettingsStore } from '@renderer/stores/settings'
import { createToolMiddleware } from './middleware/createToolMiddleware'
import {
  buildContextCompressionPrompt,
  buildMultiAgentSystemPrompt,
  buildTranslationPrompt
} from './systemPrompts'


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
  abortSignal?: AbortSignal
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
      abortSignal,
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
    const currentChat = useChatsStores().getChatById(cid)
    const isSubAgentChat = !!currentChat?.parentChatId
    const assignedBuiltinTools = selectedBuiltinTools || []
    const hasAssignedAgentTools = assignedBuiltinTools.some((toolName) =>
      toolName === 'delegate_to_sub_agent' || toolName === 'agent_communicate'
    )
    const multiAgentPrompt = hasAssignedAgentTools || isSubAgentChat ? buildMultiAgentSystemPrompt(cid) : ''
    const agentInstructions = [instructions?.trim(), skillsPrompt, multiAgentPrompt]
      .filter(Boolean)
      .join('\n\n') || undefined

    const builtinToolKeys = new Set<string>(selectedBuiltinTools || [])
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
    let ragSearchDetails: Array<{ knowledgeBaseId: string; documentId: string; score?: number }> | undefined

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

    const agent = new ToolLoopAgent({
      model: wrapLanguageModel({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        middleware: [
          createUsageGuardMiddleware(),
          createToolMiddleware(),
          createCompressContextMiddleware(),
          createContextLimitMiddleware({ contextCount }),
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchComplete: (details) => {
              ragSearchDetails = details?.map((item) => ({ ...item }))
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
          return (
            steps.length >= 20 ||
            (steps.some((step) =>
              step.toolResults?.some((toolResult) => {
                return shouldStopForToolResult({
                  toolName: toolResult.toolName,
                  output: toolResult.output
                })
              })
            ) ?? false)
          )
        }
      ],
    })

    // 1. Validate UI messages
    const validatedMessages = await validateUIMessages({
      messages,
      tools: agent.tools,
    })

    // 2. 清洗数据：移除历史中没有结果的工具调用，防止模型报错
    const sanitizedMessages = sanitizeUIMessages(validatedMessages, {
      isManualApproval: isApprovalAction || false
    })

    // 3. Convert to model messages
    const modelMessages = await convertToModelMessages(sanitizedMessages, {
      tools: agent.tools,
    })

    const result = await agent.stream({
      prompt: modelMessages,
      abortSignal: controller.signal,
    })

    const uiStream = result.toUIMessageStream({
      originalMessages: validatedMessages,
      messageMetadata: ({ part }) => {
        let finishMetadata = {}
        if (part.type === 'finish-step' && part.finishReason === 'stop') {
          finishMetadata = {
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
          stop: () => controller.abort(),
          ragSearchDetails: ragSearchDetails?.map((item) => ({ ...item })),
          ragEnabled,
          ...finishMetadata,
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
