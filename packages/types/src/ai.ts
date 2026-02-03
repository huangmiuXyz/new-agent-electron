import { UIMessage, UIMessagePart, ProviderMetadata, UIMessageChunk, LanguageModelUsage } from 'ai'
import type { Model as openAIModel } from 'openai/resources'

export type AsyncImageResult = {
  images?: Array<{ base64?: string; url?: string } | string>
  warnings?: any[]
}
export type providerType =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'google'
  | 'xai'
  | 'openai-compatible'
  | 'ollama'
  | 'hume'
  | 'elevenlabs'
export interface MetaData {
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
  providerMetadata?: ProviderMetadata
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
  [key: string]: any
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
    [key: string]: any
  }
>
export type Tools = Record<string, {
  description?: string;
  inputSchema: import('zod').ZodType<any>;
  execute: (args: any, options: { toolCallId: string; chatId: string }) => Promise<any>;
  render?: any;
  title?: string;
  needsApproval?: boolean;
}>

export type BaseMessage = UIMessage<MetaData, UIMessageChunk>
export type Tool = Tools[keyof Tools]
export type ContentBlock = UIMessagePart<any, any>
export type ModelCategory = 'text' | 'embedding' | 'image' | 'rerank' | 'speech' | 'tts'
export interface ModelVoice {
  id: string
  name: string
}
export interface Model extends openAIModel {
  name: string
  description?: string
  active?: boolean
  category?: ModelCategory
  voices?: ModelVoice[]
}

declare global {
  type AsyncImageResult = _AsyncImageResult
  type providerType = _providerType
  interface MetaData extends _MetaData { }
  interface RagSearchDetail extends _RagSearchDetail { }
  interface TranslationResult extends _TranslationResult { }
  type ClientConfig = _ClientConfig
  type Tools = _Tools
  type BaseMessage = _BaseMessage
  type Tool = _Tool
  type ContentBlock = _ContentBlock
  type ModelCategory = _ModelCategory
  interface ModelVoice extends _ModelVoice { }
  interface Model extends _Model { }
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
type _ContentBlock = ContentBlock
type _ModelCategory = ModelCategory
type _ModelVoice = ModelVoice
type _Model = Model
