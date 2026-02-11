import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { z } from 'zod';

export interface MoonshotProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

const moonshotChatOptionsSchema = z.object({
  thinking: z.object({
    type: z.enum(['enabled', 'disabled']).optional().describe('思考模式'),
    budgetTokens: z.number().min(0).max(4096).optional().describe('Token 预算'),
  }).optional().describe('思考模式配置'),
  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional().describe('推理历史保留方式'),
});

export function createMoonshot(options: MoonshotProviderSettings = {}) {
  const provider = createMoonshotAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
  });

  return Object.assign(provider, {
    chatCallOptionsSchema: moonshotChatOptionsSchema,
  });
}
