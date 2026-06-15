import {
  UIMessage,
  UIMessagePart,
  ProviderMetadata,
  UIMessageChunk,
  LanguageModelUsage,
  UIDataTypes,
  UITools
} from 'ai'

export type AsyncImageResult = {
  images?: Array<{ base64?: string; url?: string } | string>
  warnings?: unknown[]
}
export type providerType =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'google'
  | 'xai'
  | 'openrouter'
  | 'openai-compatible'
  | 'ollama'
  | 'hume'
  | 'elevenlabs'
export interface MetaData {
  isCompressedContext?: boolean
  isCompressingContext?: boolean
  compressedUpToIndex?: number
  provider: string
  date: number
  model: string
  stop: AbortController['abort']
  loading: boolean
  cid: string
  translations?: TranslationResult[]
  translationLoading?: boolean
  translationController?: AbortController['abort']
  error?: Error
  ragSearchDetails?: RagSearchDetail[]
  ragEnabled?: boolean
  usage?: LanguageModelUsage
  estimatedInputTokens?: number
  tokenUsageSource?: 'reported' | 'estimated' | 'mixed'
  providerMetadata?: ProviderMetadata
  retrying?: boolean // 是否处于自动重试等待中
  retryAttempt?: number // 当前重试次数（从 1 开始）
  retryCountdownEndsAt?: number // 下次重试的时间戳（毫秒），用于倒计时展示
  audio?: {
    chunks: {
      data: string // base64
      text: string
      duration?: number // duration in seconds
      error?: string
    }[]
    voice: string
    model: string
  }
}

export interface RagSearchDetail {
  knowledgeBaseId: string
  documentId: string
  score?: number
}

export interface TranslationResult {
  text: string
  targetLanguage: string
  timestamp: number
}
export type ClientConfig = Record<
  string,
  {
    command?: string
    args?: string[]
    url?: string
    transport?: 'http' | 'sse' | 'stdio'
    headers?: Record<string, string>
    active: boolean
    tools: Tools
    name: string
    env: string
    description?: string
  }
>
export type Tools = Record<
  string,
  {
    description?: string
    inputSchema: import('zod').ZodType<unknown>
    execute: (
      args: unknown,
      options: {
        toolCallId: string
        chatId: string
        model: string
        provider: string
      }
    ) => Promise<unknown>
    render?: unknown
    renderSummary?: (args: unknown, result: unknown) => string
    title?: string
    needsApproval?: boolean
  }
>

export type BaseMessage = UIMessage<MetaData, UIMessageChunk>
export type Tool = Tools[keyof Tools]
export type ContentBlock<T extends UIDataTypes, K extends UITools> = UIMessagePart<T, K>
export type ModelCategory = 'text' | 'embedding' | 'image' | 'video' | 'rerank' | 'speech' | 'tts'
export interface ModelVoice {
  id: string
  name: string
}
export interface Model {
  id: string
  created?: number
  object?: 'model'
  owned_by?: string
  name: string
  description?: string
  active?: boolean
  category?: ModelCategory
  voices?: ModelVoice[]
}

declare global {
  type AsyncImageResult = _AsyncImageResult
  type providerType = _providerType
  interface MetaData extends _MetaData {}
  interface RagSearchDetail extends _RagSearchDetail {}
  interface TranslationResult extends _TranslationResult {}
  type ClientConfig = _ClientConfig
  type Tools = _Tools
  type BaseMessage = _BaseMessage
  type Tool = _Tool
  type ContentBlock<T extends UIDataTypes, K extends UITools> = _ContentBlock<T, K>
  type ModelCategory = _ModelCategory
  interface ModelVoice extends _ModelVoice {}
  interface Model extends _Model {}
}

type _AsyncImageResult = AsyncImageResult
type _providerType = providerType
type _MetaData = MetaData
type _RagSearchDetail = RagSearchDetail
type _TranslationResult = TranslationResult
type _ClientConfig = ClientConfig
type _Tools = Tools
type _BaseMessage = BaseMessage
type _Tool = Tool
type _ContentBlock<T extends UIDataTypes, K extends UITools> = ContentBlock<T, K>
type _ModelCategory = ModelCategory
type _ModelVoice = ModelVoice
type _Model = Model
