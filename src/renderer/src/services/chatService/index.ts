import {
  convertToModelMessages,
  generateText as _generateText,
  ToolLoopAgent,
  ToolChoice,
  wrapLanguageModel
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'
import { createRagMiddleware } from './middleware/rags'

interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  providerType: providerType
  tools?: Tools
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
      ragEnabled
    }: ChatServiceConfig,
    updateMessageMetadata?: (mid: string, metadata: Partial<MetaData>) => void
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
    const agent = new ToolLoopAgent({
      model: wrapLanguageModel({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        middleware: [
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchStart: () => {
              const lastMessage = messages[messages.length - 1]
              if (lastMessage && updateMessageMetadata) {
                updateMessageMetadata(lastMessage.id, { ragSearching: true })
              }
            },
            onRagSearchComplete: (details) => {
              const lastMessage = messages[messages.length - 1]
              if (lastMessage && updateMessageMetadata) {
                updateMessageMetadata(lastMessage.id, {
                  ragSearching: false,
                  ragSearchDetails: details
                })
              }
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
          const result = await t.execute(input, {
            ...JSON.parse(JSON.stringify(options)),
            abortSignal: undefined
          })
          return result
        }
      })),
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
    const modalMessages = await convertToModelMessages(messages)
    const controller = new AbortController()
    const stream = await agent.stream({
      messages: modalMessages,
      abortSignal: controller.signal
    })
    const uiStream = stream.toUIMessageStream({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        const lastMessage = messages[messages.length - 1]
        return {
          ...lastMessage.metadata,
          loading: part.type !== 'finish' && part.type !== 'abort',
          provider,
          date: Date.now(),
          model,
          cid,
          stop: () => controller.abort(),
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
  const list_models = async ({ baseURL, apiKey, providerType }) => {
    await onUseAIBefore({ providerType, apiKey, baseURL })
    try {
      let url = `${baseURL}/models`
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      if (providerType === 'google') {
        const params = new URLSearchParams()
        params.append('key', apiKey)
        params.append('pageSize', '500')
        url = `${baseURL}/models?${params.toString()}`
      } else if (providerType === 'anthropic') {
        url = `${baseURL}/models`
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (providerType === 'google') {
        return {
          data: (result.models || []).map((m: any) => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name.replace('models/', ''),
            description: m.description,
            category: 'text'
          }))
        }
      } else if (providerType === 'anthropic') {
        return {
          data: (result.data || []).map((m: any) => ({
            id: m.id,
            name: m.display_name || m.id,
            category: 'text'
          }))
        }
      } else {
        return {
          data: (result.data || []).map((m: any) => ({
            ...m,
            name: m.id,
            category: 'text'
          }))
        }
      }
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
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
    translateText
  }
}
