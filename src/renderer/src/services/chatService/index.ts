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
  selectedTools?: string[] // 用户选择的工具列表，格式为 "服务器名.工具名"
}
export const chatService = () => {
  const createAgent = async (
    cid: string,
    { model, apiKey, baseURL, provider, modelType }: ChatServiceOptions,
    messages: BaseMessage[],
    { mcpClient, instructions, selectedTools }: ChatServiceConfig
  ) => {
    const close = messageApi.loading('连接mcp服务器中...')
    let tools: Tools = {}
    try {
      // 获取MCP工具
      const allTools = await list_tools(JSON.parse(JSON.stringify(mcpClient)))

      // 获取内置工具
      const builtinTools = getBuiltinTools()

      // 合并所有工具
      const mergedTools = { ...allTools, ...builtinTools }

      if (selectedTools && selectedTools.length > 0) {
        tools = {}
        selectedTools.forEach((toolKey) => {
          // 检查是否为内置工具
          if (toolKey in builtinTools) {
            tools[toolKey] = builtinTools[toolKey]
          } else {
            // MCP工具，格式为 "服务器名.工具名"
            const key = toolKey.split('.')[1]
            if (key && allTools[key]) {
              tools[key] = allTools[key]
            }
          }
        })
      } else {
        tools = mergedTools
      }
    } catch (error) {
      messageApi.error((error as Error).message)
    } finally {
      close()
    }
    debugger
    const agent = new ToolLoopAgent({
      model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
        `${modelType}:${model}`
      ),
      tools,
      instructions
    })
    const controller = new AbortController()
    const stream = await agent.stream({
      messages: convertToModelMessages(messages),
      abortSignal: controller.signal
    })
    const uiStream = stream.toUIMessageStream({
      messageMetadata: () => {
        return { provider, date: Date.now(), model, cid, stop: () => controller.abort() }
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
