// Ark Provider for 豆包/火山引擎
import type { ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ArkImageModel } from './ark-image-model';
import { z } from 'zod';

const VERSION = '1.0.0';

// Ark 图片生成参数 Schema
export const arkImageCallOptionsSchema = z.object({
  sequential_image_generation: z.enum(['auto', 'fixed']).optional().describe('连续图片生成模式'),
  watermark: z.boolean().optional().describe('是否添加水印'),
  optimize_prompt_options: z.object({
    mode: z.enum(['standard', 'fast']).optional()
  }).optional().describe('优化提示选项'),
});
export interface ArkProvider extends ProviderV3 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: string): ArkImageModel;
}

export interface ArkProviderSettings {
  /**
   * API key for authenticating requests.
   * 可以从环境变量 ARK_API_KEY 读取
   */
  apiKey?: string;

  /**
   * Base URL for the Ark/Volces API requests.
   * @default 'https://ark.cn-beijing.volces.com/api/v3'
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction;
}

/**
 * 创建豆包/火山引擎 Ark Provider 实例
 *
 * 使用示例：
 * ```typescript
 * import { createArk } from './services/ark';
 * import { generateImage } from 'ai';
 *
 * const ark = createArk({
 *   apiKey: process.env.ARK_API_KEY,
 * });
 *
 * // 1. 文生图
 * const { image } = await generateImage({
 *   model: ark.image('doubao-seedream-4-5-251128'),
 *   prompt: '一只可爱的猫咪',
 *   providerOptions: {
 *     ark: { size: '2K', response_format: 'url' }
 *   }
 * });
 *
 * // 2. 图生图（使用你的 API 格式）
 * const { images } = await generateImage({
 *   model: ark.image('doubao-seedream-4-5-251128'),
 *   prompt: '生成3张女孩和奶牛玩偶在游乐园...',
 *   n: 3,
 *   providerOptions: {
 *     ark: {
 *       image: [
 *         'https://ark-project.tos-cn-beijing.volces.com/...1.png',
 *         'https://ark-project.tos-cn-beijing.volces.com/...2.png'
 *       ],
 *       sequential_image_generation: 'auto',
 *       sequential_image_generation_options: { max_images: 3 },
 *       size: '2K',
 *       response_format: 'url',
 *       watermark: true,
 *     }
 *   }
 * });
 * ```
 */
export function createArk(
  options: ArkProviderSettings = {},
): ArkProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3'
  );

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ARK_API_KEY',
          description: 'Ark',
        })}`,
        ...options.headers,
      },
      `ai-sdk/ark/${VERSION}`,
    );

  const createImageModel = (modelId: string) =>
    new ArkImageModel(modelId, {
      provider: 'ark.image',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    image: createImageModel,
    imageModel: createImageModel,
    imageCallOptionsSchema: arkImageCallOptionsSchema,
  } as unknown as ArkProvider;
}

/**
 * 默认 Ark provider 实例
 */
export const ark = createArk();
