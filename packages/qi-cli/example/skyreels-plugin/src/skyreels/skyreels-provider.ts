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
  tag: z
    .string()
    .startsWith('@')
    .meta({
      label: '引用标记',
      hint: '引用组的标识符。必须以 `@` 开头，并出现在提示词中，例如 `@subject1`、`@image1`。'
    })
    .describe('引用标记，必须以 @ 开头，并且需要在提示词中出现'),
  type: z
    .enum(['keyframe', 'subject', 'image'])
    .meta({
      label: '引用图片类型',
      options: [
        { label: '关键帧 keyframe', value: 'keyframe' },
        { label: '主体 subject', value: 'subject' },
        { label: '普通图片 image', value: 'image' }
      ],
      hint: '图片引用类型。可选值：`keyframe`、`subject`、`image`。`keyframe` 用于关键帧参考任务，会与 `time_stamp` 字段配合，在视频指定时间显示某张参考图；`subject` 用于主体参考任务；`image` 用于不属于前两类的一般图片参考任务。'
    })
    .describe('引用图片类型'),
  image_urls: z
    .array(z.string().url())
    .min(1)
    .meta({
      label: '图片 URL 列表',
      hint: '图片 URL 列表。支持 `jpg/jpeg`、`png`、`gif`、`bmp`。图片数量限制如下：`keyframe` 为 1 张，`subject` 为 1 到 5 张，`image` 为 1 张。'
    })
    .describe('引用图片 URL 列表'),
  time_stamp: z
    .number()
    .int()
    .min(0)
    .optional()
    .meta({
      label: '时间戳',
      hint: '参考图对应的目标时间戳，仅适用于 `keyframe`。例如 `0` 表示首帧，`duration` 表示最后一帧。'
    })
    .describe('关键帧引用对应的时间戳')
})

export const skyreelsReferenceVideoSchema = z.object({
  tag: z
    .string()
    .startsWith('@')
    .meta({
      label: '引用标记',
      hint: '视频引用的标识符。必须以 `@` 开头，并出现在提示词中，例如 `@video1`。'
    })
    .describe('引用标记，必须以 @ 开头，并且需要在提示词中出现'),
  type: z
    .enum(['reference', 'base'])
    .meta({
      label: '引用视频类型',
      options: [
        { label: '动作参考 reference', value: 'reference' },
        { label: '编辑基底 base', value: 'base' }
      ],
      hint: '视频引用类型。支持两种类型：`reference` 和 `base`。`reference` 用于视频参考任务，例如动作参考；`base` 用于视频编辑相关任务。'
    })
    .describe('引用视频类型'),
  video_url: z
    .string()
    .url()
    .meta({
      label: '视频 URL',
      hint: '视频 URL。支持 `MP4`、`MOV`，最长 10 秒。'
    })
    .describe('引用视频 URL')
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
      hint: '视频的首帧图片。支持格式：`jpg/jpeg`、`png`、`gif`、`bmp`。必须是 URL。',
      ifShow: (data: any) => getCapability(data) === 'image2video'
    })
    .describe('图生视频时使用的首帧图片 URL'),
  aspect_ratio: aspectRatioSchema
    .default('16:9')
    .meta({
      label: '视频宽高比',
      hint: '生成视频的宽高比。支持值：`16:9`、`4:3`、`1:1`、`9:16`、`3:4`。注意：如果提供了 `ref_videos`，该参数会被忽略，输出尺寸会自动与参考视频对齐。',
      ifShow: (data: any) => getCapability(data) !== 'image2video'
    })
    .describe('视频宽高比'),
  sound: z
    .boolean()
    .default(false)
    .meta({
      label: '生成音效',
      hint: '生成视频是否包含音效。使用视频引用时，该参数不生效；默认不带音频。'
    })
    .describe('是否生成音效'),
  mode: modeSchema
    .default('std')
    .meta({
      label: '生成模式',
      hint: '质量/性能模式。支持值：`fast`、`std`、`pro`。`fast` 提供更快的生成速度，`std` 平衡速度与质量，`pro` 提供更高质量。所有模式输出均为 1080p。目前仅支持 `std`，`fast` 和 `pro` 将在后续加入支持。'
    })
    .describe('生成模式'),
  prompt_optimizer: z
    .boolean()
    .default(true)
    .meta({
      label: '提示词优化',
      hint: '启用自动扩写和优化提示词，以获得更高的视觉保真度和更好的提示词对齐效果。',
      ifShow: (data: any) => getCapability(data) === 'omni'
    })
    .describe('是否开启 Omni 提示词优化'),
  ref_images: z
    .array(skyreelsReferenceImageSchema)
    .optional()
    .meta({
      label: '图片引用',
      hint: '引用图片配置列表（主体、场景、风格、关键帧等）。详见下方 `ReferenceImage` 定义。限制：最多 8 个关键帧引用，最多 4 个主体引用，列表总长度最多 10。',
      ifShow: (data: any) => getCapability(data) === 'omni'
    })
    .describe('Omni 模式下的图片引用配置'),
  ref_videos: z
    .array(skyreelsReferenceVideoSchema)
    .optional()
    .meta({
      label: '视频引用',
      hint: '引用视频配置列表。详见下方 `ReferenceVideo` 定义。`ref_videos` 仅支持单个视频引用（最长 10 秒）。`ref_videos` 只能与 `ref_images` 中 `type=\"image\"` 的图片引用一起使用。',
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
