import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import {
  createProviderRegistry,
  ProviderRegistryProvider,
  generateImage,
  experimental_generateVideo
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
// import { createHume } from '@ai-sdk/hume'
// import { createElevenLabs } from '@ai-sdk/elevenlabs'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createArk } from './provider/ark/index'

import { ProviderV3 } from '@ai-sdk/provider'
import { z } from 'zod'

export interface ProviderV3Extends extends ProviderV3 {
  listModels?: () => Promise<Model[]>
  speechCallOptionsSchema?: z.ZodObject
  imageCallOptionsSchema?: z.ZodObject
  videoCallOptionsSchema?: z.ZodObject
  /** 聊天调用的参数选项 Schema */
  chatCallOptionsSchema?: z.ZodObject<any>
  generateImageAsyncTask?: (params: Parameters<typeof generateImage>[0]) => Promise<{
    task_id: string
  }>
  asyncResult?: (params: { task_id: string }) => ReturnType<typeof generateImage>
  generateVideoAsyncTask?: (
    params: Parameters<typeof experimental_generateVideo>[0] & { files?: string[] }
  ) => Promise<{
    task_id: string
  }>
  asyncVideoResult?: (params: { task_id: string }) => ReturnType<typeof experimental_generateVideo>
}

export type ProviderFactory = (options: {
  apiKey: string
  baseURL: string
  name: string
  transformRequestBody?: (args: Record<string, any>) => Record<string, any>
}) => ProviderV3Extends

interface ProviderRegistryProviderExtends<
  T extends Record<string, ProviderV3Extends>
> extends ProviderRegistryProvider<T> {
  getProvider: (providerType: keyof T) => T[keyof T]
}

export const mergeFun = (
  provider: ProviderV3,
  funs: Partial<ProviderV3Extends>
): ProviderV3Extends => {
  return {
    ...funs,
    ...provider
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
        Authorization: `Bearer ${options.apiKey}`
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

const openAICompatibleChatCallOptionsSchema = z.object({
  user: z.string().optional(),
  reasoningEffort: z.string().optional(),
  textVerbosity: z.string().optional(),
  strictJsonSchema: z.boolean().optional(),
  transformRequestBody: z
    .string()
    .optional()
    .describe('用于合并到请求体的 JSON 字符串，例如 {"custom_field":"value"}')
})

const openAIChatCallOptionsSchema = z.object({
  logitBias: z.record(z.coerce.number(), z.number()).optional(),
  logprobs: z.union([z.number(), z.boolean()]).optional(),
  parallelToolCalls: z.boolean().optional(),
  user: z.string().optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  maxCompletionTokens: z.number().optional(),
  store: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  prediction: z.record(z.string(), z.unknown()).optional(),
  serviceTier: z.enum(['default', 'auto', 'flex', 'priority']).optional(),
  strictJsonSchema: z.boolean().optional(),
  textVerbosity: z.enum(['low', 'medium', 'high']).optional(),
  promptCacheKey: z.string().optional(),
  promptCacheRetention: z.enum(['in_memory', '24h']).optional(),
  safetyIdentifier: z.string().optional(),
  systemMessageMode: z.enum(['remove', 'system', 'developer']).optional(),
  forceReasoning: z.boolean().optional()
})

const anthropicChatCallOptionsSchema = z.object({
  sendReasoning: z.boolean().optional(),
  structuredOutputMode: z.enum(['outputFormat', 'jsonTool', 'auto']).optional(),
  thinking: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('adaptive')
      }),
      z.object({
        type: z.literal('enabled'),
        budgetTokens: z.number().optional()
      }),
      z.object({
        type: z.literal('disabled')
      })
    ])
    .optional(),
  disableParallelToolUse: z.boolean().optional(),
  cacheControl: z
    .object({
      type: z.literal('ephemeral'),
      ttl: z.enum(['5m', '1h']).optional()
    })
    .optional(),
  mcpServers: z
    .array(
      z.object({
        type: z.literal('url'),
        name: z.string(),
        url: z.string(),
        authorizationToken: z.string().nullable().optional(),
        toolConfiguration: z
          .object({
            enabled: z.boolean().nullable().optional(),
            allowedTools: z.array(z.string()).nullable().optional()
          })
          .nullable()
          .optional()
      })
    )
    .optional(),
  container: z
    .object({
      id: z.string().optional(),
      skills: z
        .array(
          z.object({
            type: z.enum(['anthropic', 'custom']),
            skillId: z.string(),
            version: z.string().optional()
          })
        )
        .optional()
    })
    .optional(),
  toolStreaming: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
  speed: z.enum(['fast', 'standard']).optional(),
  contextManagement: z
    .object({
      edits: z.array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('clear_tool_uses_20250919'),
            trigger: z
              .discriminatedUnion('type', [
                z.object({
                  type: z.literal('input_tokens'),
                  value: z.number()
                }),
                z.object({
                  type: z.literal('tool_uses'),
                  value: z.number()
                })
              ])
              .optional(),
            keep: z
              .object({
                type: z.literal('tool_uses'),
                value: z.number()
              })
              .optional(),
            clearAtLeast: z
              .object({
                type: z.literal('input_tokens'),
                value: z.number()
              })
              .optional(),
            clearToolInputs: z.boolean().optional(),
            excludeTools: z.array(z.string()).optional()
          }),
          z.object({
            type: z.literal('clear_thinking_20251015'),
            keep: z
              .union([
                z.literal('all'),
                z.object({
                  type: z.literal('thinking_turns'),
                  value: z.number()
                })
              ])
              .optional()
          }),
          z.object({
            type: z.literal('compact_20260112'),
            trigger: z
              .object({
                type: z.literal('input_tokens'),
                value: z.number()
              })
              .optional(),
            pauseAfterCompaction: z.boolean().optional(),
            instructions: z.string().optional()
          })
        ])
      )
    })
    .optional()
})

const deepSeekChatCallOptionsSchema = z.object({
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional()
    })
    .optional()
})

const googleChatCallOptionsSchema = z.object({
  responseModalities: z.array(z.enum(['TEXT', 'IMAGE'])).optional(),
  thinkingConfig: z
    .object({
      thinkingBudget: z.number().optional(),
      includeThoughts: z.boolean().optional(),
      thinkingLevel: z.enum(['minimal', 'low', 'medium', 'high']).optional()
    })
    .optional(),
  cachedContent: z.string().optional(),
  structuredOutputs: z.boolean().optional(),
  safetySettings: z
    .array(
      z.object({
        category: z.enum([
          'HARM_CATEGORY_UNSPECIFIED',
          'HARM_CATEGORY_HATE_SPEECH',
          'HARM_CATEGORY_DANGEROUS_CONTENT',
          'HARM_CATEGORY_HARASSMENT',
          'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          'HARM_CATEGORY_CIVIC_INTEGRITY'
        ]),
        threshold: z.enum([
          'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
          'BLOCK_LOW_AND_ABOVE',
          'BLOCK_MEDIUM_AND_ABOVE',
          'BLOCK_ONLY_HIGH',
          'BLOCK_NONE',
          'OFF'
        ])
      })
    )
    .optional(),
  threshold: z
    .enum([
      'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      'BLOCK_LOW_AND_ABOVE',
      'BLOCK_MEDIUM_AND_ABOVE',
      'BLOCK_ONLY_HIGH',
      'BLOCK_NONE',
      'OFF'
    ])
    .optional(),
  audioTimestamp: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  mediaResolution: z
    .enum([
      'MEDIA_RESOLUTION_UNSPECIFIED',
      'MEDIA_RESOLUTION_LOW',
      'MEDIA_RESOLUTION_MEDIUM',
      'MEDIA_RESOLUTION_HIGH'
    ])
    .optional(),
  imageConfig: z
    .object({
      aspectRatio: z
        .enum([
          '1:1',
          '2:3',
          '3:2',
          '3:4',
          '4:3',
          '4:5',
          '5:4',
          '9:16',
          '16:9',
          '21:9',
          '1:8',
          '8:1',
          '1:4',
          '4:1'
        ])
        .optional(),
      imageSize: z.enum(['1K', '2K', '4K', '512']).optional()
    })
    .optional(),
  retrievalConfig: z
    .object({
      latLng: z
        .object({
          latitude: z.number(),
          longitude: z.number()
        })
        .optional()
    })
    .optional()
})

const xaiChatCallOptionsSchema = z.object({
  reasoningEffort: z.enum(['low', 'high']).optional(),
  parallel_function_calling: z.boolean().optional(),
  searchParameters: z
    .object({
      mode: z.enum(['off', 'auto', 'on']),
      returnCitations: z.boolean().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      maxSearchResults: z.number().optional(),
      sources: z
        .array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('web'),
              country: z.string().optional(),
              excludedWebsites: z.array(z.string()).optional(),
              allowedWebsites: z.array(z.string()).optional(),
              safeSearch: z.boolean().optional()
            }),
            z.object({
              type: z.literal('x'),
              excludedXHandles: z.array(z.string()).optional(),
              includedXHandles: z.array(z.string()).optional(),
              postFavoriteCount: z.number().optional(),
              postViewCount: z.number().optional(),
              xHandles: z.array(z.string()).optional()
            }),
            z.object({
              type: z.literal('news'),
              country: z.string().optional(),
              excludedWebsites: z.array(z.string()).optional(),
              safeSearch: z.boolean().optional()
            }),
            z.object({
              type: z.literal('rss'),
              links: z.array(z.string())
            })
          ])
        )
        .optional()
    })
    .optional()
})

export const providerFactories = shallowReactive<Record<string, ProviderFactory>>({
  anthropic: (options) =>
    mergeFun(createAnthropic(options), {
      chatCallOptionsSchema: anthropicChatCallOptionsSchema,
      listModels: createStandardListModels(options, {
        headers: {
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01'
        },
        transformModel: (m) => ({ name: m.display_name || m.id })
      })
    }),
  deepseek: (options) =>
    mergeFun(createDeepSeek(options), {
      chatCallOptionsSchema: deepSeekChatCallOptionsSchema,
      listModels: createStandardListModels(options)
    }),
  google: (options) =>
    mergeFun(createGoogleGenerativeAI(options), {
      chatCallOptionsSchema: googleChatCallOptionsSchema,
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
  xai: (options) =>
    mergeFun(createXai(options), {
      chatCallOptionsSchema: xaiChatCallOptionsSchema,
      listModels: createStandardListModels(options)
    }),
  openai: (options) =>
    mergeFun(createOpenAI(options), {
      chatCallOptionsSchema: openAIChatCallOptionsSchema,
      listModels: createStandardListModels(options, {
        getCategory: (id) =>
          id.includes('tts') ? 'tts' : id.includes('embed') ? 'embedding' : 'text',
        transformModel: (m) => (m.id.includes('tts') ? { voices: OPENAI_TTS_VOICES } : {})
      })
    }),
  ollama: (options) =>
    mergeFun(createOpenAICompatible(options), {
      chatCallOptionsSchema: openAICompatibleChatCallOptionsSchema,
      listModels: createStandardListModels(options)
    }),
  openrouter: (options) =>
    mergeFun(createOpenRouter(options), {
      listModels: createStandardListModels(options),
      chatCallOptionsSchema: z.object({
        models: z.array(z.string()).optional().describe('可用的模型列表'),

        reasoning: z
          .object({
            enabled: z.boolean().optional().describe('是否启用推理'),
            exclude: z.boolean().optional().describe('为 true 时从响应中移除推理内容'),
            max_tokens: z.number().int().min(1).optional().describe('推理的最大 token 数'),
            effort: z
              .enum(['xhigh', 'high', 'medium', 'low', 'minimal', 'none'])
              .optional()
              .default('medium')
              .describe('推理努力程度')
          })
          .optional()
          .describe('推理配置'),

        user: z.string().optional().describe('终端用户的唯一标识')
      })
    }),
  // hume: (options) => mergeFun(createHume(options) as unknown as ProviderV3, {
  //   listModels: async () => {
  //     const response = await fetch(`${options.baseURL}/v0/tts/voices?provider=HUME_AI`, {
  //       headers: {
  //         'X-Hume-Api-Key': options.apiKey
  //       }
  //     })
  //     const result = (await response.json()) as CommonModelResponse
  //     return [
  //       {
  //         id: 'hume-tts',
  //         name: 'Hume TTS',
  //         category: 'tts',
  //         voices: (result.voices_page || []).map((v) => ({
  //           id: v.id,
  //           name: v.name
  //         })),
  //         object: 'model',
  //         created: Date.now(),
  //         owned_by: 'hume'
  //       }
  //     ] as Model[]
  //   }
  // }),
  // elevenlabs: (options) => mergeFun(createElevenLabs(options), {
  //   listModels: async () => {
  //     const headers = {
  //       'xi-api-key': options.apiKey
  //     }
  //     const [voicesResponse, modelsResponse] = await Promise.all([
  //       fetch(`${options.baseURL}/v1/voices`, { headers }),
  //       fetch(`${options.baseURL}/v1/models`, { headers })
  //     ])
  //     const voicesResult = (await voicesResponse.json()) as CommonModelResponse
  //     const modelsResult = (await modelsResponse.json()) as { model_id: string; name: string; description: string }[]
  //     const voices = (voicesResult.voices || []).map((v) => ({
  //       id: v.voice_id,
  //       name: v.name
  //     }))

  //     return (modelsResult || []).map((m) => ({
  //       id: m.model_id,
  //       name: m.name,
  //       description: m.description,
  //       category: 'tts',
  //       voices: voices,
  //       object: 'model',
  //       created: Date.now(),
  //       owned_by: 'elevenlabs'
  //     })) as Model[]
  //   }
  // }),
  'openai-compatible': (options) =>
    mergeFun(
      createOpenAICompatible({
        ...options,
        name: options.name,
        transformRequestBody: options.transformRequestBody
      }),
      {
        chatCallOptionsSchema: openAICompatibleChatCallOptionsSchema,
        listModels: createStandardListModels(options)
      }
    ),
  ark: (options) => {
    return mergeFun(
      createArk(options),
      mergeFun(
        createOpenAICompatible({
          ...options,
          name: options.name,
          transformRequestBody: options.transformRequestBody
        }),
        {
          chatCallOptionsSchema: openAICompatibleChatCallOptionsSchema,
          listModels: createStandardListModels(options)
        }
      )
    )
  }
})

export const providerMetadatas = shallowReactive<Record<string, { hide?: boolean }>>({})

export const registerProviderFactory = (
  name: string,
  factory: ProviderFactory,
  options?: { hide?: boolean }
) => {
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

export const createRegistry = (options: {
  apiKey: string
  baseURL: string
  name: string
  transformRequestBody?: (args: Record<string, any>) => Record<string, any>
}) => {
  const providers: Record<string, ProviderV3Extends> = {}
  Object.keys(providerFactories).forEach((key) => {
    providers[key] = providerFactories[key](options)
  })

  const registry = createProviderRegistry(providers) as ProviderRegistryProviderExtends<
    Record<string, ProviderV3Extends>
  >
  return registry
}
