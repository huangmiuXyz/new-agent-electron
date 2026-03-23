import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  type FetchFunction,
  postJsonToApi
} from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { SKYREELS_ENDPOINTS, type SkyReelsCapability } from '../constants'

export type SkyReelsVideoModelId = string

export interface SkyReelsVideoModelConfig {
  provider: string
  baseURL: string
  headers: () => Record<string, string | undefined>
  fetch?: FetchFunction
}

const submitResponseSchema = z.object({
  task_id: z.string(),
  msg: z.string().optional(),
  code: z.number().optional(),
  status: z.string(),
  data: z.unknown().nullable().optional(),
  trace_id: z.string().optional()
})

const queryResponseSchema = z.object({
  task_id: z.string(),
  msg: z.string().optional(),
  code: z.number().optional(),
  status: z.string(),
  data: z
    .object({
      video_url: z.string().optional(),
      duration: z.number().optional(),
      resolution: z.string().optional()
    })
    .nullable()
    .optional(),
  trace_id: z.string().optional()
})

const skyreelsErrorSchema = z.object({
  msg: z.string().optional(),
  message: z.string().optional(),
  error: z
    .object({
      message: z.string().optional()
    })
    .optional()
})

export class SkyReelsVideoModel {
  constructor(
    readonly modelId: SkyReelsVideoModelId,
    private readonly config: SkyReelsVideoModelConfig
  ) {}

  private buildUrl(path: string): string {
    return `${this.config.baseURL}${path}`
  }

  async createTask(
    capability: SkyReelsCapability,
    body: Record<string, unknown>
  ): Promise<z.infer<typeof submitResponseSchema>> {
    const endpoint = SKYREELS_ENDPOINTS[capability]

    const { value } = await postJsonToApi({
      url: this.buildUrl(endpoint.submitPath),
      headers: this.config.headers(),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: skyreelsErrorSchema,
        errorToMessage: (error: unknown) => {
          const err = error as {
            msg?: string
            message?: string
            error?: { message?: string }
          }
          return err.msg || err.message || err.error?.message || 'SkyReels request failed'
        }
      }),
      successfulResponseHandler: createJsonResponseHandler(submitResponseSchema),
      fetch: this.config.fetch
    })

    if (value.status !== 'ok' || value.code !== 200) {
      throw new Error(value.msg || 'SkyReels task submission failed')
    }

    return value
  }

  async getTaskStatus(
    capability: SkyReelsCapability,
    taskId: string
  ): Promise<z.infer<typeof queryResponseSchema>> {
    const endpoint = SKYREELS_ENDPOINTS[capability]
    const response = await (this.config.fetch ?? fetch)(this.buildUrl(endpoint.queryPath(taskId)), {
      method: 'GET',
      headers: this.config.headers() as Record<string, string>
    })

    const data = queryResponseSchema.parse(await response.json())
    if (!response.ok) {
      throw new Error(data.msg || `SkyReels task query failed with status ${response.status}`)
    }

    return data
  }
}
