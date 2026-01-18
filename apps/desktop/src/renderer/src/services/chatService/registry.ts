import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createProviderRegistry, ProviderRegistryProvider, generateImage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createHume } from '@ai-sdk/hume'
import { createElevenLabs } from '@ai-sdk/elevenlabs'
import { ProviderV3 } from '@ai-sdk/provider'
import { z } from 'zod'
import { shallowReactive } from 'vue'
export interface ProviderV3Extends extends ProviderV3 {
  listModels?: () => Promise<Model[]>
  speechCallOptionsSchema?: z.ZodObject
  imageCallOptionsSchema?: z.ZodObject
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

export const providerFactories = shallowReactive<Record<string, ProviderFactory>>({
  anthropic: (options) => mergeFun(createAnthropic(options), {
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01'
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        category: 'text'
      })) as Model[]
    }
  }),
  deepseek: (options) => mergeFun(createDeepSeek(options), {
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        ...m,
        id: m.id,
        name: m.id,
        category: 'text'
      })) as Model[]
    }
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
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${options.apiKey}`
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        ...m,
        id: m.id,
        name: m.id,
        category: 'text'
      })) as Model[]
    }
  }),
  openai: (options) => mergeFun(createOpenAI(options), {
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${options.apiKey}`
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        category: (m.id.includes('tts') ? 'tts' : m.id.includes('embed') ? 'embedding' : 'text') as ModelCategory,
        voices: m.id.includes('tts')
          ? [
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
          : undefined
      })) as Model[]
    }
  }),
  ollama: (options) => mergeFun(createOpenAICompatible(options), {
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${options.apiKey}`
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        ...m,
        id: m.id,
        name: m.id,
        category: 'text'
      })) as Model[]
    }
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
    listModels: async () => {
      const response = await fetch(`${options.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${options.apiKey}`
        }
      })
      const result = (await response.json()) as CommonModelResponse
      return (result.data || []).map((m) => ({
        ...m,
        id: m.id,
        name: m.id,
        category: 'text'
      })) as Model[]
    }
  })
})

export const registerProviderFactory = (name: string, factory: ProviderFactory) => {
  providerFactories[name] = (options) => {
    const provider = mergeFun(factory(options), providerFactories['openai-compatible'](options))
    return provider
  }
}

export const getProviderTypes = () => {
  return Object.keys(providerFactories)
}

export const createRegistry = (options: { apiKey: string; baseURL: string; name: string }) => {
  const providers: Record<string, ProviderV3Extends> = {}
  Object.keys(providerFactories).forEach((key) => {
    providers[key] = providerFactories[key](options)
  })

  const registry = createProviderRegistry(providers) as ProviderRegistryProviderExtends<Record<string, ProviderV3Extends>>
  return registry
}
