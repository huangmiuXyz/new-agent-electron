import { z } from 'zod/v4';

export const modelScopeImageCallOptionsSchema = z.object({
  model: z.string().describe('模型id'),
  prompt: z.string().max(2000).describe('正向提示词'),
  negative_prompt: z.string().max(2000).optional().describe('负向提示词'),
  size: z.string().optional().describe('生成图像分辨率大小'),
  seed: z.number().int().min(0).max(2147483647).optional().describe('随机种子'),
  steps: z.number().int().min(1).max(100).optional().describe('采样步数'),
  guidance: z.number().min(1.5).max(20).optional().describe('提示词引导系数'),
  image_url: z.string().url().optional().describe('待编辑图片的url地址'),
  loras: z.record(z.string(), z.number()).optional().describe('LoRA模型'),
});

export type ModelScopeImageAPITypes = {
  model: string;
  prompt: string;
  negative_prompt?: string;
  size?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  image_url?: string;
  loras?: string | Record<string, number>;
};

export interface ModelScopeImageAPIResponse {
  task_id: string;
  task_status?: 'PENDING' | 'RUNNING' | 'SUCCEED' | 'FAILED';
  output_images?: string[];
  errors?: {
    code: number;
    message: string;
  };
}
