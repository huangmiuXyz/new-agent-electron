import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  type FetchFunction,
  postJsonToApi
} from '@ai-sdk/provider-utils'
import { z } from 'zod'

export type ArkVideoModelId = string

export interface ArkVideoModelConfig {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { path: string }) => string
  fetch?: FetchFunction
}

export interface ArkVideoTaskRequest {
  model: string
  content: Array<{
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'draft_task'
    text?: string
    image_url?: {
      url: string
    }
    video_url?: {
      url: string
    }
    audio_url?: {
      url: string
    }
    draft_task?: {
      id: string
    }
    role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio'
  }>
  duration?: number
  frames?: number
  resolution?: string
  ratio?: string
  seed?: number
  camera_fixed?: boolean
  watermark?: boolean
  generate_audio?: boolean
  draft?: boolean
  return_last_frame?: boolean
  service_tier?: 'default' | 'flex'
  execution_expires_after?: number
  callback_url?: string
  tools?: Array<{
    type: 'web_search'
  }>
}

export interface ArkVideoTaskResponse {
  id: string
}

export interface ArkVideoTaskStatusResponse {
  id: string
  status: 'running' | 'succeeded' | 'failed' | 'queued' | 'expired' | 'canceled'
  content?: {
    video_url: string
  }
  error?: {
    code: string
    message: string
  }
}

export class ArkVideoModel {
  constructor(
    readonly modelId: ArkVideoModelId,
    private readonly config: ArkVideoModelConfig
  ) {}

  async createTask(params: Omit<ArkVideoTaskRequest, 'model'>): Promise<ArkVideoTaskResponse> {
    const requestBody: ArkVideoTaskRequest = {
      model: this.modelId,
      ...params
    }

    const { value } = await postJsonToApi({
      url: this.config.url({ path: '/contents/generations/tasks' }),
      headers: this.config.headers(),
      body: requestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: arkErrorSchema,
        errorToMessage: (error: any) => error.error?.message ?? 'Unknown error'
      }),
      successfulResponseHandler: createJsonResponseHandler(z.object({ id: z.string() })),
      fetch: this.config.fetch
    })

    return value
  }

  async getTaskStatus(taskId: string): Promise<ArkVideoTaskStatusResponse> {
    const response = await (this.config.fetch || fetch)(
      this.config.url({ path: `/contents/generations/tasks/${taskId}` }),
      {
        headers: this.config.headers() as Record<string, string>
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message ?? 'Failed to get task status')
    }

    return await response.json()
  }
}

const arkErrorSchema = z.object({
  error: z
    .object({
      message: z.string(),
      type: z.string().optional(),
      code: z.string().optional()
    })
    .optional()
})
