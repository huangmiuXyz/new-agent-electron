import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

export type ArkImageModelId = string;

export interface ArkImageModelConfig {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
}

/**
 * 豆包/火山引擎图片生成模型
 *
 * 特点：
 * 1. 图生图使用 /images/generations 端点（而非 /images/edits）
 * 2. 支持通过 JSON 传递图片 URL 数组
 * 3. 支持 response_format: "url" 返回图片 URL
 * 4. 支持特殊参数如 sequential_image_generation, watermark 等
 * 
 * 模型图片输入支持：
 * - doubao-seedream-3.0-t2i：不支持图片输入（纯文生图）
 * - doubao-seedream-4.5/4.0：支持单图或多图输入
 * - doubao-seededit-3.0-i2i：仅支持单图输入
 */
export class ArkImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 10;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ArkImageModelId,
    private readonly config: ArkImageModelConfig,
  ) { }

  /**
   * The provider options key used to extract provider-specific options.
   */
  private get providerOptionsKey(): string {
    return 'ark';
  }

  private isToolsSupportedModel(): boolean {
    return /^doubao-seedream-5(?:[.-]0)?-lite(?:-|$)/.test(this.modelId);
  }

  /**
   * 从 providerOptions 中提取 ark 特有的参数
   */
  private getArgs(
    providerOptions: Record<string, unknown>,
  ): Record<string, unknown> {
    return (providerOptions[this.providerOptionsKey] as Record<string, unknown>) ?? {};
  }

  private convertFilesToArkFormat(files: ImageModelV3File[]): string[] {
    return files.map(file => {
      if (file.type === 'url') {
        return file.url;
      }
      let base64Data: string;
      if (typeof file.data === 'string') {
        base64Data = file.data;
      } else {
        base64Data = this.arrayBufferToBase64(file.data);
      }
      const mediaType = file.mediaType || 'image/png';
      const format = mediaType.split('/')[1] || 'png';
      return `data:image/${format.toLowerCase()};base64,${base64Data}`;
    });
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

    const warnings: Array<SharedV3Warning> = [];

    const currentDate = new Date();

    const arkOptions = this.getArgs(providerOptions ?? {});
    const { tools, ...otherArkOptions } = arkOptions;

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      size,
      ...otherArkOptions,
      seed,
      response_format: 'b64_json',
      sequential_image_generation_options: {
        max_images: n
      },
    };

    if (this.isToolsSupportedModel() && Array.isArray(tools) && tools.length > 0) {
      requestBody.tools = tools;
    }

    if (files && files.length > 0) {
      const convertedImages = this.convertFilesToArkFormat(files);
      requestBody.image = convertedImages;
    }


    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/images/generations',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: requestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: arkErrorSchema,
        errorToMessage: (error: unknown) => {
          const err = error as { error?: { message?: string } };
          return err.error?.message ?? 'Unknown error';
        },
      }),
      successfulResponseHandler: createJsonResponseHandler(
        arkImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(img => img.b64_json!),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        ark: {
          images: response.data.map(item => ({
            ...(item.url ? { url: item.url } : {}),
          })),
          ...(response.usage ? { usage: response.usage } : {}),
        },
      },
    };
  }
}

// 豆包错误响应结构
const arkErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional(),
  }).optional(),
});

// 豆包图片生成响应结构
// 支持 url 或 b64_json 返回格式
const arkImageResponseSchema = z.object({
  model: z.string(),
  created: z.number(),
  data: z.array(z.object({
    url: z.string().optional(),
    b64_json: z.string().optional(),
    size: z.string().optional(), // 仅 doubao-seedream-4.5/4.0 支持，格式如 "2048×2048"
  })),
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
    tool_usage: z.object({
      web_search: z.number().optional(),
    }).optional(),
  }).optional(),
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }).optional(),
});
