import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createProviderRegistry, ProviderRegistryProvider, generateImage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createHume } from '@ai-sdk/hume'
import { createElevenLabs } from '@ai-sdk/elevenlabs'
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { ProviderV3 } from '@ai-sdk/provider'
import { z } from 'zod'
import { shallowReactive } from 'vue'
export interface ProviderV3Extends extends ProviderV3 {
  listModels?: () => Promise<Model[]>
  speechCallOptionsSchema?: z.ZodObject
  imageCallOptionsSchema?: z.ZodObject
  /** 聊天调用的参数选项 Schema */
  chatCallOptionsSchema?: z.ZodObject<any>
  generateImageAsyncTask: (params: Parameters<typeof generateImage>[0]) => {
    task_id: string
  }
  asyncResult: ({ task_id }) => ReturnType<typeof generateImage>
}

export type ProviderFactory = (options: { apiKey: string; baseURL: string; name: string }) => ProviderV3Extends

interface ProviderRegistryProviderExtends<T extends Record<string, ProviderV3Extends>> extends ProviderRegistryProvider<T> {
  getProvider: (providerType: keyof T) => T[keyof T]
}

export const mergeFun = <T extends ProviderV3Extends>(provider: Partial<T>, funs: Partial<ProviderV3Extends>): ProviderV3Extends => {
  return {
    ...funs,
    ...provider,
  } as ProviderV3Extends
}

interface CommonModelResponse {
  data?: {
    id: string
    display_name?: string
    [key: string]: unknown
  }[]
  models?: {
    name: string
    displayName?: string
    description?: string
  }[]
  voices_page?: {
    id: string
    name: string
  }[]
  voices?: {
    voice_id: string
    name: string
  }[]
}

// OpenAI TTS 默认语音列表
const OPENAI_TTS_VOICES = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'ash', name: 'Ash' },
  { id: 'ballad', name: 'Ballad' },
  { id: 'coral', name: 'Coral' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'sage', name: 'Sage' },
  { id: 'shimmer', name: 'Shimmer' },
  { id: 'verse', name: 'Verse' },
  { id: 'marin', name: 'Marin' },
  { id: 'cedar', name: 'Cedar' }
]

// 标准 listModels 工厂函数
const createStandardListModels = (
  options: { apiKey: string; baseURL: string },
  config?: {
    headers?: Record<string, string>
    getCategory?: (modelId: string) => string
    transformModel?: (m: any) => Partial<Model>
  }
) => {
  return async () => {
    const response = await fetch(`${options.baseURL}/models`, {
      headers: config?.headers ?? {
        'Authorization': `Bearer ${options.apiKey}`
      }
    })
    const result = (await response.json()) as CommonModelResponse
    return (result.data || []).map((m) => ({
      ...m,
      id: m.id,
      name: m.id,
      category: (config?.getCategory?.(m.id) ?? 'text') as ModelCategory,
      ...config?.transformModel?.(m)
    })) as Model[]
  }
}

export const providerFactories = shallowReactive<Record<string, ProviderFactory>>({
  anthropic: (options) => mergeFun(createAnthropic(options), {
    listModels: createStandardListModels(options, {
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01'
      },
      transformModel: (m) => ({ name: m.display_name || m.id })
    })
  }),
  deepseek: (options) => mergeFun(createDeepSeek(options), {
    listModels: createStandardListModels(options)
  }),
  google: (options) => mergeFun(createGoogleGenerativeAI(options), {
    listModels: async () => {
      const params = new URLSearchParams()
      params.append('key', options.apiKey)
      params.append('pageSize', '500')
      const response = await fetch(`${options.baseURL}/models?${params.toString()}`)
      const result = (await response.json()) as CommonModelResponse
      return (result.models || []).map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
        description: m.description,
        category: 'text'
      })) as Model[]
    }
  }),
  xai: (options) => mergeFun(createXai(options), {
    listModels: createStandardListModels(options)
  }),
  openai: (options) => mergeFun(createOpenAI(options), {
    listModels: createStandardListModels(options, {
      getCategory: (id) => id.includes('tts') ? 'tts' : id.includes('embed') ? 'embedding' : 'text',
      transformModel: (m) => m.id.includes('tts') ? { voices: OPENAI_TTS_VOICES } : {}
    })
  }),
  ollama: (options) => mergeFun(createOpenAICompatible(options), {
    listModels: createStandardListModels(options)
  }),
  openrouter: (options) => mergeFun(createOpenRouter(options), {
    listModels: createStandardListModels(options)
  }),
  hume: (options) => mergeFun(createHume(options) as unknown as ProviderV3, {
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/v0/tts/voices?provider=HUME_AI`, {
        headers: {
          'X-Hume-Api-Key': options.apiKey
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return [
        {
          id: 'hume-tts',
          name: 'Hume TTS',
          category: 'tts',
          voices: (result.voices_page || []).map((v) => ({
            id: v.id,
            name: v.name
          })),
          object: 'model',
          created: Date.now(),
          owned_by: 'hume'
        }
      ] as Model[]
    }
  }),
  elevenlabs: (options) => mergeFun(createElevenLabs(options), {
    listModels: async () => {
      const headers = {
        'xi-api-key': options.apiKey
      }
      const [voicesResponse, modelsResponse] = await Promise.all([
        fetch(`${options.baseURL}/v1/voices`, { headers }),
        fetch(`${options.baseURL}/v1/models`, { headers })
      ])
      const voicesResult = (await voicesResponse.json()) as CommonModelResponse
      const modelsResult = (await modelsResponse.json()) as { model_id: string; name: string; description: string }[]
      const voices = (voicesResult.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name
      }))

      return (modelsResult || []).map((m) => ({
        id: m.model_id,
        name: m.name,
        description: m.description,
        category: 'tts',
        voices: voices,
        object: 'model',
        created: Date.now(),
        owned_by: 'elevenlabs'
      })) as Model[]
    }
  }),
  'openai-compatible': (options) => mergeFun(createOpenAICompatible({ ...options, name: options.name }), {
    listModels: createStandardListModels(options)
  })
})

export const providerMetadatas = shallowReactive<Record<string, { hide?: boolean }>>({})

export const registerProviderFactory = (name: string, factory: ProviderFactory, options?: { hide?: boolean }) => {
  providerFactories[name] = (options) => {
    const provider = mergeFun(factory(options), providerFactories['openai-compatible'](options))
    return provider
  }
  if (options?.hide) {
    providerMetadatas[name] = { hide: true }
  }
}

export const unregisterProviderFactory = (name: string) => {
  delete providerFactories[name]
  delete providerMetadatas[name]
}

export const getProviderTypes = () => {
  return Object.keys(providerFactories).filter((key) => !providerMetadatas[key]?.hide)
}

export const createRegistry = (options: { apiKey: string; baseURL: string; name: string }) => {
  const providers: Record<string, ProviderV3Extends> = {}
  Object.keys(providerFactories).forEach((key) => {
    providers[key] = providerFactories[key](options)
  })

  const registry = createProviderRegistry(providers) as ProviderRegistryProviderExtends<Record<string, ProviderV3Extends>>
  return registry
}
