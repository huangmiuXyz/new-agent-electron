import {
  convertToModelMessages,
  generateText as _generateText,
  ToolLoopAgent,
  ToolChoice
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'

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
  mcpTools?: string[] // 用户选择的MCP工具列表，格式为 "服务器名.工具名"
  builtinTools?: string[] // 用户选择的内置工具列表
  knowledgeBaseIds?: string[] // 关联的知识库ID列表
  thinkingMode?: boolean // 思考模式
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
      thinkingMode
    }: ChatServiceConfig
  ) => {
    let tools: any = {}
    const builtinTools = getBuiltinTools({ knowledgeBaseIds })

    // 处理内置工具
    if (selectedBuiltinTools && selectedBuiltinTools.length > 0) {
      selectedBuiltinTools.forEach((toolKey) => {
        if (toolKey in builtinTools) {
          tools[toolKey] = builtinTools[toolKey]
        }
      })
    }

    // 处理MCP工具
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
      model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
        `${providerType}:${model}`
      ),
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
    const controller = new AbortController()
    const stream = await agent.stream({
      messages: convertToModelMessages(messages),
      abortSignal: controller.signal
    })
    const uiStream = stream.toUIMessageStream({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        return {
          loading: part.type !== 'finish' && part.type !== 'abort',
          provider,
          date: Date.now(),
          model,
          cid,
          stop: () => controller.abort()
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
    const result = await _generateText({
      model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
        `${providerType}:${model}`
      ),
      tools,
      prompt,
      toolChoice
    })
    return result
  }

  const translateText = async (
    text: string,
    targetLanguage: string = '中文',
    { model, apiKey, baseURL, provider, providerType }: ChatServiceOptions,
    abortSignal?: AbortSignal
  ) => {
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
  const list_models = async ({ baseURL, apiKey }) => {
    try {
      const models = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      })
      return await models.json()
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }
  const list_tools = async (config: ClientConfig, cache?: boolean) => {
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
  }
  return {
    createAgent,
    list_models,
    list_tools,
    generateText,
    translateText
  }
}
