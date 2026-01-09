import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createProviderRegistry, ProviderRegistryProvider } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createHume } from '@ai-sdk/hume'
import { createElevenLabs } from '@ai-sdk/elevenlabs'
import { ProviderV3 } from '@ai-sdk/provider'
import { createMiniMax } from './minimax'
interface ProviderV3Extends extends ProviderV3 {
  listModels?: () => Promise<Model[]>
}
interface ProviderRegistryProviderExtends<T extends Record<string, ProviderV3Extends>> extends ProviderRegistryProvider<T> {
  getProvider: (providerType: keyof T) => T[keyof T]
}
const mergeFun = <T extends ProviderV3>(provider: T, funs: Partial<ProviderV3Extends>): ProviderV3Extends => {
  return {
    ...provider,
    ...funs,
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

export const createRegistry = (options: { apiKey: string; baseURL: string; name: string }) => {
  const providers: Record<string, ProviderV3Extends> = {
    anthropic: mergeFun(createAnthropic(options), {
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
    deepseek: mergeFun(createDeepSeek(options), {
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
    google: mergeFun(createGoogleGenerativeAI(options), {
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
    xai: mergeFun(createXai(options), {
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
    openai: mergeFun(createOpenAI({ ...options, name: options.name }), {
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
          category: (m.id.includes('tts') ? 'speech' : m.id.includes('embed') ? 'embedding' : 'text') as ModelCategory,
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
    ollama: mergeFun(createOpenAICompatible(options), {
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
    hume: mergeFun(createHume(options) as unknown as ProviderV3, {
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
            category: 'speech',
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
    elevenlabs: mergeFun(createElevenLabs(options), {
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
          category: 'speech',
          voices: voices,
          object: 'model',
          created: Date.now(),
          owned_by: 'elevenlabs'
        })) as Model[]
      }
    }),
    minimax: createMiniMax(options) as unknown as ProviderV3Extends,
    'openai-compatible': mergeFun(createOpenAICompatible({ ...options, name: options.name }), {
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
  }
  const registry = createProviderRegistry(providers) as ProviderRegistryProviderExtends<Record<string, ProviderV3Extends>>
  registry.getProvider = (providerType: string) => providers[providerType]
  return registry
}
