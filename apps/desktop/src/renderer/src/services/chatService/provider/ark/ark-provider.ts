// Ark Provider for 豆包/火山引擎
import type { ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ArkImageModel } from './ark-image-model';
import { ArkVideoModel } from './ark-video-model';
import { z } from 'zod';
import type { GenerateVideoResult, GeneratedFile } from 'ai';

const VERSION = '1.0.0';

// Ark 图片生成参数 Schema
export const arkImageCallOptionsSchema = z.object({
  // 功能选项
  sequential_image_generation: z.enum(['auto', 'fixed']).optional().describe('连续图片生成模式'),
  watermark: z.boolean().optional().describe('是否添加水印'),
  optimize_prompt_options: z.object({
    mode: z.enum(['standard', 'fast']).default('standard').optional()
  }).optional().describe('优化提示选项'),
});

// Content 数组项的类型定义
const contentItemSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({ url: z.string().meta({ component: 'upload' }) }),
    role: z.enum(['first_frame', 'last_frame', 'reference_image']).optional()
  }),
  // z.object({ type: z.literal('draft_task'), draft_task: z.object({ id: z.string() }) }),
]);

// Ark 视频生成参数 Schema (对齐火山引擎文档)
export const arkVideoCallOptionsSchema = z.object({
  // 图片输入
  first_frame: z.string().meta({ component: 'upload', media: 'image', type: 'b64_json' }).optional().describe('首帧图片URL'),
  last_frame: z.string().meta({ component: 'upload', media: 'image', type: 'b64_json' }).optional().describe('尾帧图片URL'),

  // 功能开关
  generate_audio: z.boolean().default(false).describe('生成同步音频 (仅 Seedance 1.5 pro)'),
  draft: z.boolean().default(false).describe('开启样片模式 (仅 Seedance 1.5 pro, 开启后不支持时长设置)'),
  camera_fixed: z.boolean().default(false).describe('固定镜头 (保持视角稳定)'),
  watermark: z.boolean().default(true).describe('添加水印'),
  return_last_frame: z.boolean().default(false).describe('返回尾帧图像 (用于衔接下一个视频)'),

  // 高级配置
  service_tier: z.enum(['default', 'flex']).default('default').describe('服务等级 (flex 为离线模式，成本更低)'),
  execution_expires_after: z.number().int().min(3600).max(259200).default(7200).describe('任务超时阈值 (秒)'),
});

export interface ArkProvider extends ProviderV3 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: string): ArkImageModel;

  /**
   * Creates a model for video generation.
   */
  video(modelId: string): ArkVideoModel;

  imageCallOptionsSchema: typeof arkImageCallOptionsSchema;
  videoCallOptionsSchema: typeof arkVideoCallOptionsSchema;

  generateVideoAsyncTask(params: any): Promise<{ task_id: string }>;
  asyncVideoResult(params: { task_id: string }): Promise<GenerateVideoResult>;
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

  const createVideoModel = (modelId: string) =>
    new ArkVideoModel(modelId, {
      provider: 'ark.video',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const generateVideoAsyncTask = async (params: any) => {
    const model = createVideoModel(params.model);
    const arkOptions = params.providerOptions?.ark || {};

    // 确保应用 Zod 默认值
    const validatedOptions = arkVideoCallOptionsSchema.parse(arkOptions);

    // 构建 content 数组
    const content: Array<{ type: string; text?: string; image_url?: { url: string }; role?: string }> = [];

    // 添加文本 prompt
    if (params.prompt) {
      content.push({ type: 'text', text: params.prompt });
    }

    // 处理首帧图片
    if (validatedOptions.first_frame) {
      content.push({
        type: 'image_url',
        image_url: { url: validatedOptions.first_frame },
        role: 'first_frame'
      });
    }

    // 处理尾帧图片
    if (validatedOptions.last_frame) {
      content.push({
        type: 'image_url',
        image_url: { url: validatedOptions.last_frame },
        role: 'last_frame'
      });
    }

    // files 作为参考图片
    if (params.files && params.files.length > 0) {
      for (const file of params.files) {
        const url = typeof file === 'string' ? file : (file.url || file.data);
        content.push({
          type: 'image_url',
          image_url: { url },
          role: 'reference_image'
        });
      }
    }

    // 构造请求体：参数应位于根节点 (对齐火山引擎"新方式"接口规范)
    const requestBody: any = {
      content,
      seed: params.seed,
      generate_audio: validatedOptions.generate_audio,
      draft: validatedOptions.draft,
      camera_fixed: validatedOptions.camera_fixed,
      watermark: validatedOptions.watermark,
      return_last_frame: validatedOptions.return_last_frame,
      service_tier: validatedOptions.service_tier,
      execution_expires_after: validatedOptions.execution_expires_after,
      duration: params.duration,
    };

    const task = await model.createTask(requestBody);
    return { task_id: task.id };
  };

  const asyncVideoResult = async ({ task_id }: { task_id: string }): Promise<GenerateVideoResult> => {
    // 使用默认模型 ID 查询任务状态
    const model = createVideoModel('default');
    const status = await model.getTaskStatus(task_id);

    if (status.status !== 'succeeded' || !status.content?.video?.url) {
      throw new Error(status.error?.message ?? `Video generation ${status.status}`);
    }

    // 从 URL 获取视频内容并转换为 GeneratedFile
    const videoUrl = status.content.video.url;
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 将 Uint8Array 转换为 base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    const videoFile: GeneratedFile = {
      base64,
      uint8Array,
      mediaType: 'video/mp4',
    };

    return {
      video: videoFile,
      videos: [videoFile],
      warnings: [],
      responses: [{
        timestamp: new Date(),
        modelId: 'ark-video',
      }],
      providerMetadata: {},
    };
  };

  return {
    image: createImageModel,
    imageModel: createImageModel,
    video: createVideoModel,
    imageCallOptionsSchema: arkImageCallOptionsSchema,
    videoCallOptionsSchema: arkVideoCallOptionsSchema,
    generateVideoAsyncTask,
    asyncVideoResult,
  } as unknown as ArkProvider;
}

/**
 * 默认 Ark provider 实例
 */
export const ark = createArk();
