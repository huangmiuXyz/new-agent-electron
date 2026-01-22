import { UIMessage, UIMessagePart, ProviderMetadata, UIMessageChunk, LanguageModelUsage, generateImage } from 'ai'
import type { Model as openAIModel } from 'openai/resources'
import { type MCPClient } from '@ai-sdk/mcp'

declare global {
  type AsyncImageResult = {
    images?: Array<{ base64?: string; url?: string } | string>
    warnings?: any[]
  }
  type providerType =
    | 'anthropic'
    | 'openai'
    | 'deepseek'
    | 'google'
    | 'xai'
    | 'openai-compatible'
    | 'ollama'
    | 'hume'
    | 'elevenlabs'
  interface MetaData {
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

  interface RagSearchDetail {
    knowledgeBaseId: string
    documentId: string
    score?: number
  }

  interface TranslationResult {
    text: string
    targetLanguage: string
    timestamp: number
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
  type Tools = Record<string, {
    description?: string;
    inputSchema: import('zod').ZodType<any>;
    execute: (args: any, options: { toolCallId: string; chatId: string }) => Promise<any>;
    render?: any;
    title?: string;
    needsApproval?: boolean;
  }>

  type BaseMessage = UIMessage<MetaData, UIMessageChunk>
  type Tool = Tools[keyof Tools]
  type ContentBlock = UIMessagePart
  type ModelCategory = 'text' | 'embedding' | 'image' | 'rerank' | 'speech' | 'tts'
  interface ModelVoice {
    id: string
    name: string
  }
  interface Model extends openAIModel {
    name: string
    description?: string
    active?: boolean
    category?: ModelCategory
    voices?: ModelVoice[]
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

export { }
