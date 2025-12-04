import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createProviderRegistry } from 'ai'

export const createRegistry = (options: { apiKey: string; baseURL: string }) => {
  {
    return createProviderRegistry({
      anthropic: createAnthropic(options),
      openai: createOpenAI(options),
      deepseek: createDeepSeek(options),
      google: createGoogleGenerativeAI(options),
      xai: createXai(options)
    })
  }
}
