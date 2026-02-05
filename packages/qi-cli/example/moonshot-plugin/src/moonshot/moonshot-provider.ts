import { createMoonshotAI } from '@ai-sdk/moonshotai';

export interface MoonshotProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export function createMoonshot(options: MoonshotProviderSettings = {}) {
  return createMoonshotAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
  });
}
