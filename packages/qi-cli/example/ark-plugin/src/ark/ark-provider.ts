import type { ProviderV3 } from '@ai-sdk/provider'
import {
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix
} from '@ai-sdk/provider-utils'
import { z } from 'zod'
import type { GenerateVideoResult, GeneratedFile } from 'ai'
import { ArkImageModel } from './ark-image-model'
import { ArkVideoModel } from './ark-video-model'
import { DEFAULT_BASE_URL } from '../constants'

const VERSION = '1.0.0'

export const arkImageCallOptionsSchema = z.object({
  sequential_image_generation: z
    .enum(['auto', 'fixed'])
    .default('auto')
    .optional()
    .describe('Sequential image generation mode'),
  watermark: z.boolean().optional().describe('Whether to add watermark'),
  optimize_prompt_options: z
    .object({
      mode: z.enum(['standard', 'fast']).default('standard').optional()
    })
    .optional()
    .describe('Prompt optimization options'),
  tools: z
    .array(
      z.object({
        type: z.enum(['web_search']).describe('Tool type')
      })
    )
    .optional()
    .describe('Model tools configuration')
})

export const arkVideoCallOptionsSchema = z.object({
  first_frame: z
    .string()
    .meta({ label: 'First Frame', component: 'upload', media: 'image', type: 'b64_json' })
    .optional()
    .describe('First frame image URL'),
  last_frame: z
    .string()
    .meta({ label: 'Last Frame', component: 'upload', media: 'image', type: 'b64_json' })
    .optional()
    .describe('Last frame image URL'),
  generate_audio: z.boolean().default(false).describe('Generate synced audio'),
  camera_fixed: z.boolean().default(false).describe('Keep camera fixed'),
  service_tier: z.enum(['default', 'flex']).default('default').describe('Service tier'),
  tools: z
    .array(
      z.object({
        type: z.enum(['web_search']).describe('Tool type')
      })
    )
    .optional()
    .describe('Model tools configuration')
})

export interface ArkProvider extends ProviderV3 {
  image(modelId: string): ArkImageModel
  video(modelId: string): ArkVideoModel
  imageCallOptionsSchema: typeof arkImageCallOptionsSchema
  videoCallOptionsSchema: typeof arkVideoCallOptionsSchema
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

export interface ArkProviderSettings {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
}

export function createArk(options: ArkProviderSettings = {}): ArkProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL)

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ARK_API_KEY',
          description: 'Ark'
        })}`,
        ...options.headers
      },
      `ai-sdk/ark/${VERSION}`
    )

  const createImageModel = (modelId: string) =>
    new ArkImageModel(modelId, {
      provider: 'ark.image',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    })

  const createVideoModel = (modelId: string) =>
    new ArkVideoModel(modelId, {
      provider: 'ark.video',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    })

  const generateVideoAsyncTask = async (params: any) => {
    const model = createVideoModel(params.model)
    const arkOptions = params.providerOptions?.ark || {}
    const validatedOptions = arkVideoCallOptionsSchema.parse(arkOptions)

    const content: Array<{
      type: string
      text?: string
      image_url?: { url: string }
      video_url?: { url: string }
      audio_url?: { url: string }
      role?: string
    }> = []

    if (params.prompt) {
      content.push({ type: 'text', text: params.prompt })
    }
    if (validatedOptions.first_frame) {
      content.push({
        type: 'image_url',
        image_url: { url: validatedOptions.first_frame },
        role: 'first_frame'
      })
    }
    if (validatedOptions.last_frame) {
      content.push({
        type: 'image_url',
        image_url: { url: validatedOptions.last_frame },
        role: 'last_frame'
      })
    }
    if (params.files && params.files.length > 0) {
      for (const file of params.files) {
        const url = typeof file === 'string' ? file : file.url || file.data
        const mimeType = typeof file === 'object' ? file.mimeType : null

        if (mimeType?.startsWith('video/')) {
          content.push({
            type: 'video_url',
            video_url: { url },
            role: 'reference_video'
          })
        } else if (mimeType?.startsWith('audio/')) {
          content.push({
            type: 'audio_url',
            audio_url: { url },
            role: 'reference_audio'
          })
        } else {
          content.push({
            type: 'image_url',
            image_url: { url },
            role: 'reference_image'
          })
        }
      }
    }

    const requestBody: any = {
      content,
      seed: params.seed,
      generate_audio: validatedOptions.generate_audio,
      camera_fixed: validatedOptions.camera_fixed,
      service_tier: validatedOptions.service_tier,
      duration: params.duration,
      resolution: params.resolution,
      tools: validatedOptions.tools
    }

    const task = await model.createTask(requestBody)
    return { task_id: task.id }
  }

  const asyncVideoResult = async ({ task_id }: { task_id: string }) => {
    const model = createVideoModel('default')
    const status = await model.getTaskStatus(task_id)

    if (status.status === 'running' || status.status === 'queued') {
      return { status: 'pending' as const }
    }

    if (status.status === 'failed') {
      return {
        status: 'failed' as const,
        error: status.error?.message ?? 'Video generation failed'
      }
    }

    if (!status.content?.video_url) {
      return {
        status: 'failed' as const,
        error: `Video generation ${status.status}`
      }
    }

    const response = await fetch(status.content.video_url)
    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    let binary = ''
    for (let i = 0; i < uint8Array.length; i += 1) {
      binary += String.fromCharCode(uint8Array[i]!)
    }
    const base64 = btoa(binary)

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
          modelId: 'ark-video'
        }
      ],
      providerMetadata: {}
    }
  }

  return {
    image: createImageModel,
    imageModel: createImageModel,
    video: createVideoModel,
    imageCallOptionsSchema: arkImageCallOptionsSchema,
    videoCallOptionsSchema: arkVideoCallOptionsSchema,
    generateVideoAsyncTask,
    asyncVideoResult
  } as unknown as ArkProvider
}

export const ark = createArk()
