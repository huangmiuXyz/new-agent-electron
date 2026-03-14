import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider'
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils'
import { MiniMaxSpeechModel } from './minimax-speech-model'
import { MiniMaxGetVoiceResp, MiniMaxGetVoiceReq } from './minimax-api-types'
import { Model, ModelVoice } from '../types'

const VERSION = '1.0.0'

export interface MiniMaxProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => MiniMaxSpeechModel
  }

  speech(modelId?: string): SpeechModelV3
  listModels: () => Promise<Model[]>
}

export interface MiniMaxProviderSettings {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
}

export function createMiniMax(
  options: MiniMaxProviderSettings = {},
): MiniMaxProvider {
  const normalizeBaseURL = (value: string) => value.replace(/\/+$/, '')
  const joinPath = (base: string, path: string) => {
    const normalizedBase = normalizeBaseURL(base)
    if (normalizedBase.endsWith('/v1') && path.startsWith('/v1/')) {
      return `${normalizedBase}${path.slice(3)}`
    }
    return `${normalizedBase}${path}`
  }

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax',
        })}`,
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    )

  const baseURL = options.baseURL ?? 'https://api.minimaxi.com'

  const createSpeechModel = (modelId: string = 'speech-2.6-hd') =>
    new MiniMaxSpeechModel(modelId, {
      provider: 'minimax.speech',
      url: ({ path }) => joinPath(baseURL, path),
      headers: getHeaders,
      fetch: options.fetch,
    })

  const provider = function () {
    return {
      speech: createSpeechModel,
    }
  }

  provider.speech = createSpeechModel
  provider.speechModel = createSpeechModel
  provider.speechCallOptionsSchema = MiniMaxSpeechModel.speechCallOptionsSchema

  const defaultModels = [
    {
      id: 'speech-2.6-hd',
      category: 'tts',
      name: 'MiniMax Speech 2.6 HD',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'speech-2.6-turbo',
      category: 'tts',
      name: 'MiniMax Speech 2.6 Turbo',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'speech-02-hd',
      category: 'tts',
      name: 'MiniMax Speech 02 HD',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'speech-02-turbo',
      category: 'tts',
      name: 'MiniMax Speech 02 Turbo',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'speech-01-hd',
      category: 'tts',
      name: 'MiniMax Speech 01 HD',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'speech-01-turbo',
      category: 'tts',
      name: 'MiniMax Speech 01 Turbo',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'music-2.5+',
      category: 'tts',
      name: 'MiniMax Music 2.5+',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    },
    {
      id: 'music-2.5',
      category: 'tts',
      name: 'MiniMax Music 2.5',
      created: 1694521600,
      object: 'model',
      owned_by: 'minimax'
    }
  ] as Model[]

  provider.listModels = async () => {
    try {
      const headers = getHeaders()
      const response = await fetch(joinPath(baseURL, '/get_voice'), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          voice_type: 'all'
        } as MiniMaxGetVoiceReq)
      })

      const result = (await response.json()) as MiniMaxGetVoiceResp
      if (result.base_resp?.status_code !== 0) {
        console.error(`MiniMax Get Voice Error: ${result.base_resp?.status_msg}`)
        return defaultModels
      }

      const voices: ModelVoice[] = [
        ...(result.system_voice || []).map((v) => ({
          id: v.voice_id,
          name: v.voice_name || v.voice_id
        })),
        ...(result.voice_cloning || []).map((v) => ({
          id: v.voice_id,
          name: v.voice_id
        })),
        ...(result.voice_generation || []).map((v) => ({
          id: v.voice_id,
          name: v.voice_id
        }))
      ]

      return defaultModels.map((m) => ({
        ...m,
        ...(m.id.startsWith('speech-') ? { voices } : {})
      }))
    } catch (error) {
      console.error('Failed to fetch MiniMax voices:', error)
      return defaultModels
    }
  }

  return provider satisfies MiniMaxProvider
}

export const minimax = createMiniMax()
