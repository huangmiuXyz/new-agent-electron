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
  onBeforeToolExecute?: (params: { tool: Tool; input: string; options: any }) => Promise<void>
}

export interface ImageGenerateOptions {
  n?: number
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: any
}
const processMessagesWithToolOutput = (messages: BaseMessage[]): BaseMessage[] => {
  const processedMessages = JSON.parse(JSON.stringify(messages)) as BaseMessage[]
  for (const message of processedMessages) {
    if (message.parts && Array.isArray(message.parts)) {
      message.parts = message.parts.map((part) => {
        if (!isToolUIPart(part)) {
          return part
        }
        if (!part.output) {
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
      onBeforeToolExecute
    }: ChatServiceConfig
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
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
        deepseek: {
          thinking: {
            type: thinkingMode ? 'enabled' : 'disabled'
          }
        }
      },
      tools: mapValues(tools, (t) => ({
        ...t,
        execute: async (input, options) => {
          await onBeforeToolExecute?.({ tool: t, input, options })
          const result = await t.execute(input, {
            ...JSON.parse(JSON.stringify(options)),
            chatId: cid,
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
    debugger
    const processedMessages = processMessagesWithToolOutput(messages)
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
