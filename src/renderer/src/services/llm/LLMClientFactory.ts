import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'

export type LLMClient = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic | ChatDeepSeek

export interface ILLMClientFactory {
  createClient(provider: Provider, model: Model): LLMClient
}

export class LLMClientFactory implements ILLMClientFactory {
  createClient(provider: Provider, model: Model): LLMClient {
    const baseConfig = {
      model: model.id,
      apiKey: provider.apiKey!,
      streaming: true
    }

    switch (provider.modelType) {
      case 'deepseek':
        return new ChatDeepSeek({
          ...baseConfig,
          apiKey: provider.apiKey
        })
      case 'openai':
        return new ChatOpenAI({
          ...baseConfig,
          configuration: { baseURL: provider.baseUrl }
        })
      case 'google-genai':
        return new ChatGoogleGenerativeAI({
          ...baseConfig,
          apiKey: provider.apiKey,
          model: model.id,
          baseUrl: provider.baseUrl
        })
      case 'anthropic':
        return new ChatAnthropic({
          ...baseConfig,
          apiKey: provider.apiKey,
          anthropicApiUrl: provider.baseUrl
        })
      default:
        throw new Error(`未知的模型类型: ${provider.modelType || 'undefined'}`)
    }
  }
}
