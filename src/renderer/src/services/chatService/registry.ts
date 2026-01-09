import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createProviderRegistry } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createHume } from '@ai-sdk/hume'
import { createElevenLabs } from '@ai-sdk/elevenlabs'
import { ProviderV3 } from '@ai-sdk/provider'

export const createRegistry = (options: { apiKey: string; baseURL: string; name: string }) => {
  return createProviderRegistry({
    anthropic: createAnthropic(options),
    deepseek: createDeepSeek(options),
    google: createGoogleGenerativeAI(options),
    xai: createXai(options),
    openai: createOpenAI({ ...options, name: options.name }),
    ollama: createOpenAICompatible(options),
    hume: createHume(options) as unknown as ProviderV3,
    elevenlabs: createElevenLabs(options),
    'openai-compatible': createOpenAICompatible({ ...options, name: options.name }),
  })
}
