import {
  type ImageModelV3,
  type ImageModelV3File,
  type SharedV3Warning
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  type FetchFunction,
  postJsonToApi
} from '@ai-sdk/provider-utils'
import { z } from 'zod'

export type ArkImageModelId = string

export interface ArkImageModelConfig {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: FetchFunction
}

export class ArkImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3'
  readonly maxImagesPerCall = 10

  get provider(): string {
    return this.config.provider
  }

  constructor(
    readonly modelId: ArkImageModelId,
    private readonly config: ArkImageModelConfig
  ) {}

  private get providerOptionsKey(): string {
    return 'ark'
  }

  private isToolsSupportedModel(): boolean {
    return /^doubao-seedream-5(?:[.-]0)?-lite(?:-|$)/.test(this.modelId)
  }

  private getArgs(providerOptions: Record<string, unknown>): Record<string, unknown> {
    return (providerOptions[this.providerOptionsKey] as Record<string, unknown>) ?? {}
  }

  private convertFilesToArkFormat(files: ImageModelV3File[]): string[] {
    return files.map((file) => {
      if (file.type === 'url') {
        return file.url
      }

      const base64Data =
        typeof file.data === 'string' ? file.data : this.arrayBufferToBase64(file.data)
      const mediaType = file.mediaType || 'image/png'
      const format = mediaType.split('/')[1] || 'png'
      return `data:image/${format.toLowerCase()};base64,${base64Data}`
    })
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }

  async doGenerate({
    prompt,
    seed,
    providerOptions,
    headers,
    abortSignal,
    files,
    size,
    n
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = []
    const currentDate = new Date()
    const arkOptions = this.getArgs(providerOptions ?? {})
    const { tools, ...otherArkOptions } = arkOptions

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      size,
      ...otherArkOptions,
      seed,
      response_format: 'b64_json',
      sequential_image_generation_options: {
        max_images: n
      }
    }

    if (this.isToolsSupportedModel() && Array.isArray(tools) && tools.length > 0) {
      requestBody.tools = tools
    }

    if (files && files.length > 0) {
      requestBody.image = this.convertFilesToArkFormat(files)
    }

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/images/generations',
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: requestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: arkErrorSchema,
        errorToMessage: (error: unknown) => {
          const err = error as { error?: { message?: string } }
          return err.error?.message ?? 'Unknown error'
        }
      }),
      successfulResponseHandler: createJsonResponseHandler(arkImageResponseSchema),
      abortSignal,
      fetch: this.config.fetch
    })

    return {
      images: response.data.map((img) => img.b64_json!),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders
      },
      providerMetadata: {
        ark: {
          images: response.data.map((item) => ({
            ...(item.url ? { url: item.url } : {})
          })),
          ...(response.usage ? { usage: response.usage } : {})
        }
      }
    }
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

const arkImageResponseSchema = z.object({
  model: z.string(),
  created: z.number(),
  data: z.array(
    z.object({
      url: z.string().optional(),
      b64_json: z.string().optional(),
      size: z.string().optional()
    })
  ),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
      tool_usage: z
        .object({
          web_search: z.number().optional()
        })
        .optional()
    })
    .optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional()
    })
    .optional()
})
