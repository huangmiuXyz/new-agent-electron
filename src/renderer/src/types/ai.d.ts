import { UIMessage, UIMessagePart, UIMessageChunk } from 'ai'
import type { Model as openAIModel } from 'openai/resources'
declare global {
  type providerType =
    | 'anthropic'
    | 'openai'
    | 'deepseek'
    | 'google'
    | 'xai'
    | 'openai-compatible'
    | 'ollama'
  interface MetaData {
    provider: string
    date: number
    model: string
    stop: AbortController['abort'] | null
    loading: boolean
    cid: string
    translations?: TranslationResult[]
    translationLoading?: boolean
    translationController?: AbortController['abort']
    error?: Error
  }

  interface TranslationResult {
    text: string
    targetLanguage: string
    timestamp: number
  }
  type BaseMessage = UIMessage<MetaData, UIMessageChunk>
  type Tools = Awaited<ReturnType<typeof window.api.list_tools>>
  type ContentBlock = UIMessagePart
  type ModelCategory = 'text' | 'embedding' | 'image' | 'rerank'
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
    category: ModelCategory
  }
  type ClientConfig = Record<
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
}

export {}
