import { convertToModelMessages, generateText as _generateText, ToolLoopAgent } from 'ai'
import { createRegistry } from './registry'
import { getBuiltinTools } from '../builtin-tools'
type ModelType = 'anthropic' | 'openai' | 'deepseek' | 'google' | 'xai' | 'openai-compatible'
interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  modelType: ModelType
}

interface ChatServiceConfig {
  mcpClient: ClientConfig
  instructions?: string
  mcpTools?: string[] // 用户选择的MCP工具列表，格式为 "服务器名.工具名"
  builtinTools?: string[] // 用户选择的内置工具列表
}
export const chatService = () => {
  const createAgent = async (
    cid: string,
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions,
    messages: BaseMessage[],
    { mcpClient, instructions, mcpTools, builtinTools: selectedBuiltinTools }: ChatServiceConfig
  ) => {
    let tools: Tools = {}
    const builtinTools = getBuiltinTools()

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
        `${modelType}:${model}`
      ),
      tools,
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
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions
  ) => {
    const result = await _generateText({
      model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
        `${modelType}:${model}`
      ),
      prompt
    })
    return result.text
  }

  const translateText = async (
    text: string,
    targetLanguage: string = '中文',
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions,
    abortSignal?: AbortSignal
  ) => {
    const prompt = `请将以下文本翻译为${targetLanguage}，只返回翻译结果，不要添加任何解释或额外内容：\n\n${text}`
    const result = await _generateText({
      model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
        `${modelType}:${model}`
      ),
      prompt,
      abortSignal
    })
    return result.text
  }
  const list_models = async ({ baseURL, apiKey }) => {
    const models = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      }
    })
    return await models.json()
  }
  const list_tools = async (config: ClientConfig, cache?: boolean) => {
    const tools = await window.api.list_tools(config, cache)
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
