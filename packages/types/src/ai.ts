import { UIMessage, UIMessagePart, ProviderMetadata, UIMessageChunk, LanguageModelUsage } from 'ai'
import type { Model as openAIModel } from 'openai/resources'
import type { MCPClient } from '@ai-sdk/mcp'

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

export type BaseMessage = UIMessage<MetaData, UIMessageChunk>
export type Tools = Awaited<ReturnType<MCPClient['tools']>>
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
