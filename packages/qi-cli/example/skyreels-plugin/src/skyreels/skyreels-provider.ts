import type { ProviderV3 } from '@ai-sdk/provider'
import {
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix
} from '@ai-sdk/provider-utils'
import type { GenerateVideoResult, GeneratedFile } from 'ai'
import { z } from 'zod'
import {
  DEFAULT_MODEL_ID,
  DEFAULT_BASE_URL,
  type SkyReelsCapability
} from '../constants'
import { SkyReelsVideoModel } from './skyreels-video-model'

const VERSION = '1.0.0'

const aspectRatioSchema = z.enum(['16:9', '4:3', '1:1', '9:16', '3:4'])
const modeSchema = z.enum(['fast', 'std', 'pro'])
const capabilitySchema = z.enum(['text2video', 'image2video', 'omni'])

const getCapability = (data: any): SkyReelsCapability =>
  data?.providerOptions?.skyreels?.capability || 'text2video'

export const skyreelsReferenceImageSchema = z.object({
  tag: z.string().startsWith('@').describe('引用标记，必须以 @ 开头，并且需要在提示词中出现'),
  type: z
    .enum(['keyframe', 'subject', 'image'])
    .describe('引用图片类型'),
  image_urls: z
    .array(z.string().url())
    .min(1)
    .describe('引用图片 URL 列表'),
  time_stamp: z.number().int().optional().describe('关键帧引用对应的时间戳')
})

export const skyreelsReferenceVideoSchema = z.object({
  tag: z.string().startsWith('@').describe('引用标记，必须以 @ 开头，并且需要在提示词中出现'),
  type: z.enum(['reference', 'base']).describe('引用视频类型'),
  video_url: z.string().url().describe('引用视频 URL')
})

export const skyreelsVideoCallOptionsSchema = z.object({
  capability: capabilitySchema
    .default('text2video')
    .meta({
      label: '生成方式',
      options: [
        { label: '文生视频', value: 'text2video' },
        { label: '图生视频', value: 'image2video' },
        { label: '全能参考', value: 'omni' }
      ]
    })
    .describe('选择当前使用的生成方式'),
  first_frame_image: z
    .string()
    .optional()
    .meta({
      label: '首帧图片',
      ifShow: (data: any) => getCapability(data) === 'image2video'
    })
    .describe('图生视频时使用的首帧图片 URL'),
  aspect_ratio: aspectRatioSchema
    .default('16:9')
    .meta({
      label: '视频宽高比',
      ifShow: (data: any) => getCapability(data) !== 'image2video'
    })
    .describe('视频宽高比'),
  sound: z.boolean().default(false).meta({ label: '生成音效' }).describe('是否生成音效'),
  mode: modeSchema.default('std').meta({ label: '生成模式' }).describe('生成模式'),
  prompt_optimizer: z
    .boolean()
    .default(true)
    .meta({
      label: '提示词优化',
      ifShow: (data: any) => getCapability(data) === 'omni'
    })
    .describe('是否开启 Omni 提示词优化'),
  ref_images: z
    .array(skyreelsReferenceImageSchema)
    .optional()
    .meta({
      label: '图片引用',
      ifShow: (data: any) => getCapability(data) === 'omni'
    })
    .describe('Omni 模式下的图片引用配置'),
  ref_videos: z
    .array(skyreelsReferenceVideoSchema)
    .optional()
    .meta({
      label: '视频引用',
      ifShow: (data: any) => getCapability(data) === 'omni'
    })
    .describe('Omni 模式下的视频引用配置')
})

export type SkyReelsReferenceImage = z.infer<typeof skyreelsReferenceImageSchema>
export type SkyReelsReferenceVideo = z.infer<typeof skyreelsReferenceVideoSchema>

export interface SkyReelsProvider extends ProviderV3 {
  video(modelId?: string): SkyReelsVideoModel
  videoCallOptionsSchema: typeof skyreelsVideoCallOptionsSchema
  generateVideoAsyncTask(params: any): Promise<{ task_id: string }>
  asyncVideoResult(params: { task_id: string }): Promise<
    | GenerateVideoResult
    | {
        status: 'pending' | 'failed'
        error?: string
        videos?: GeneratedFile[]
      }
  >
}

export interface SkyReelsProviderSettings {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
}

interface SkyReelsTaskResponse {
  task_id: string
  msg?: string
  code?: number
  status: string
  data?: {
    video_url?: string
    duration?: number
    resolution?: string
  } | null
  trace_id?: string
}

const pendingStatuses = new Set(['submitted', 'pending', 'running'])

function toBase64(uint8Array: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < uint8Array.length; i += 1) {
    binary += String.fromCharCode(uint8Array[i]!)
  }
  return btoa(binary)
}

function normalizeFileUrl(file: unknown): string | undefined {
  if (typeof file === 'string') {
    return file
  }
  if (file && typeof file === 'object') {
    const candidate = file as { url?: string; data?: string }
    return candidate.url || candidate.data
  }
  return undefined
}

function inferCapability(options: z.infer<typeof skyreelsVideoCallOptionsSchema>): SkyReelsCapability {
  if (options.capability) {
    return options.capability
  }
  if ((options.ref_images && options.ref_images.length > 0) || (options.ref_videos && options.ref_videos.length > 0)) {
    return 'omni'
  }
  if (options.first_frame_image) {
    return 'image2video'
  }
  return 'text2video'
}

function mapTaskStatus(status: string, response: SkyReelsTaskResponse) {
  if (pendingStatuses.has(status)) {
    return { status: 'pending' as const }
  }

  if (status === 'failed' || status === 'unknown') {
    return {
      status: 'failed' as const,
      error: response.msg || `SkyReels task failed with status: ${status}`
    }
  }

  return null
}

export function createSkyReels(options: SkyReelsProviderSettings = {}): SkyReelsProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL)!

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'Content-Type': 'application/json',
        ...options.headers
      },
      `ai-sdk/skyreels/${VERSION}`
    )

  const createVideoModel = (modelId: string = DEFAULT_MODEL_ID) =>
    new SkyReelsVideoModel(modelId, {
      provider: 'skyreels.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch
    })

  const getApiKey = () =>
    loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'SKYREELS_API_KEY',
      description: 'SkyReels'
    })

  const generateVideoAsyncTask = async (params: any) => {
    const skyreelsOptions = skyreelsVideoCallOptionsSchema.parse(
      params.providerOptions?.skyreels || {}
    )

    if (!params.prompt || typeof params.prompt !== 'string') {
      throw new Error('SkyReels video generation requires a prompt.')
    }

    if (!skyreelsOptions.first_frame_image && Array.isArray(params.files) && params.files.length > 0) {
      const firstFile = normalizeFileUrl(params.files[0])
      if (firstFile) {
        skyreelsOptions.first_frame_image = firstFile
      }
    }

    const capability = inferCapability(skyreelsOptions)
    const model = createVideoModel(params.model)

    const requestBody: Record<string, unknown> = {
      api_key: getApiKey(),
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: skyreelsOptions.aspect_ratio,
      sound: skyreelsOptions.sound,
      mode: skyreelsOptions.mode
    }

    if (capability === 'image2video') {
      requestBody.first_frame_image = skyreelsOptions.first_frame_image
    }

    if (capability === 'omni') {
      requestBody.ref_images = skyreelsOptions.ref_images
      requestBody.ref_videos = skyreelsOptions.ref_videos
      requestBody.prompt_optimizer = skyreelsOptions.prompt_optimizer
    }

    const task = await model.createTask(capability, requestBody)
    return { task_id: `${capability}:${task.task_id}` }
  }

  const asyncVideoResult = async ({ task_id }: { task_id: string }) => {
    const separatorIndex = task_id.indexOf(':')
    const capability = (separatorIndex > 0 ? task_id.slice(0, separatorIndex) : 'text2video') as SkyReelsCapability
    const rawTaskId = separatorIndex > 0 ? task_id.slice(separatorIndex + 1) : task_id

    const model = createVideoModel(DEFAULT_MODEL_ID)
    const taskResponse = await model.getTaskStatus(capability, rawTaskId)
    const normalizedStatus = mapTaskStatus(taskResponse.status, taskResponse)

    if (normalizedStatus) {
      return normalizedStatus
    }

    const videoUrl = taskResponse.data?.video_url
    if (!videoUrl) {
      return {
        status: 'failed' as const,
        error: taskResponse.msg || `SkyReels task did not return a video URL.`
      }
    }

    const response = await (options.fetch ?? fetch)(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`)
    }

    const uint8Array = new Uint8Array(await response.arrayBuffer())
    const base64 = toBase64(uint8Array)

    const videoFile: GeneratedFile = {
      base64,
      uint8Array,
      mediaType: 'video/mp4'
    }

    return {
      video: videoFile,
      videos: [videoFile],
      warnings: [],
      responses: [
        {
          timestamp: new Date(),
          modelId: DEFAULT_MODEL_ID
        }
      ],
      providerMetadata: {
        skyreels: {
          capability,
          taskId: rawTaskId,
          traceId: taskResponse.trace_id,
          duration: taskResponse.data?.duration,
          resolution: taskResponse.data?.resolution,
          videoUrl
        }
      }
    }
  }

  return {
    video: createVideoModel,
    videoModel: createVideoModel,
    videoCallOptionsSchema: skyreelsVideoCallOptionsSchema,
    generateVideoAsyncTask,
    asyncVideoResult
  } as unknown as SkyReelsProvider
}

export const skyreels = createSkyReels()
