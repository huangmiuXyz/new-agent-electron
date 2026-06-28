import type { ToolChoice, DataContent, StopCondition } from 'ai'

export interface VideoGenerateOptions {
  n?: number
  duration?: number
  resolution?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: any
}

export interface ChatServiceOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  providerType: providerType
  tools?: any
  toolChoice?: ToolChoice<any>
}

export interface ChatServiceConfig {
  mcpClient: ClientConfig
  instructions?: string
  mcpTools?: string[]
  mcpResourceContent?: string
  builtinTools?: string[]
  builtinToolsRequireApproval?: string[]
  builtinToolConfigs?: Agent['builtinToolConfigs']
  skillsEnabled?: boolean
  knowledgeBaseIds?: string[]
  thinkingMode?: string | null
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
  enableCodexEnvContext?: boolean
  providerOptions?: Record<string, any>
  onBeforeToolExecute?: (params: { tool: Tool; input: string; options: any }) => Promise<void>
  isApprovalAction?: boolean
  abortSignal?: AbortSignal
  stopWhen?: StopCondition<any, any>[]
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

export interface AutoCompressOptions {
  cid: string
  messages: BaseMessage[]
  contextCount?: number
  contextTokenCount?: number
  compressModel?: { providerId: string; modelId: string }
  activeModel?: string
}
