import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

export type ArkVideoModelId = string;

export interface ArkVideoModelConfig {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: FetchFunction;
}

export interface ArkVideoTaskRequest {
  model: string;
  content: Array<{
    type: 'text' | 'image_url' | 'draft_task';
    text?: string;
    image_url?: {
      url: string;
    };
    draft_task?: {
      id: string;
    };
    role?: 'first_frame' | 'last_frame' | 'reference_image';
  }>;
  duration?: number;
  fps?: number;
  frames?: number;
  resolution?: string;
  ratio?: string;
  seed?: number;
  camera_fixed?: boolean;
  watermark?: boolean;
  generate_audio?: boolean;
  draft?: boolean;
  return_last_frame?: boolean;
  service_tier?: 'default' | 'flex';
  execution_expires_after?: number;
  callback_url?: string;
}

export interface ArkVideoTaskResponse {
  id: string;
}

export interface ArkVideoTaskStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  content?: {
    video?: {
      url: string;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 豆包/火山引擎视频生成模型
 */
export class ArkVideoModel {
  constructor(
    readonly modelId: ArkVideoModelId,
    private readonly config: ArkVideoModelConfig,
  ) { }

  /**
   * 创建视频生成任务
   */
  async createTask(params: Omit<ArkVideoTaskRequest, 'model'>): Promise<ArkVideoTaskResponse> {
    const requestBody: ArkVideoTaskRequest = {
      model: this.modelId,
      ...params,
    };
    debugger

    const { value } = await postJsonToApi({
      url: this.config.url({ path: '/contents/generations/tasks' }),
      headers: this.config.headers(),
      body: requestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: arkErrorSchema,
        errorToMessage: (error: any) => error.error?.message ?? 'Unknown error',
      }),
      successfulResponseHandler: createJsonResponseHandler(
        z.object({ id: z.string() }),
      ),
      fetch: this.config.fetch,
    });

    return value;
  }

  /**
   * 查询视频生成任务状态
   */
  async getTaskStatus(taskId: string): Promise<ArkVideoTaskStatusResponse> {
    const response = await (this.config.fetch || fetch)(
      this.config.url({ path: `/contents/generations/tasks/${taskId}` }),
      {
        headers: this.config.headers() as Record<string, string>,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message ?? 'Failed to get task status');
    }

    return await response.json();
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
