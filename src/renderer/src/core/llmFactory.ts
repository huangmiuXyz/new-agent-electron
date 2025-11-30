import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export interface LLMConfig {
  provider: Provider
  model: Model
}

export class LLMFactory {
  static create({ provider, model }: LLMConfig): BaseChatModel {
    const base = {
      model: model.id,
      apiKey: provider.apiKey!,
      streaming: true
    }

    switch (provider.modelType) {
      case 'deepseek':
        return new ChatDeepSeek({ ...base, apiKey: provider.apiKey })
      case 'openai':
        return new ChatOpenAI({
          ...base,
          configuration: { baseURL: provider.baseUrl }
        })
      case 'google-genai':
        return new ChatGoogleGenerativeAI({
          ...base,
          apiKey: provider.apiKey,
          model: model.id,
          baseUrl: provider.baseUrl
        })
      case 'anthropic':
        return new ChatAnthropic({
          ...base,
          apiKey: provider.apiKey,
          anthropicApiUrl: provider.baseUrl
        })
      default:
        throw new Error(`未知的模型类型: ${provider.modelType || 'undefined'}`)
    }
  }

  static async listModels(apiKey: string, baseURL: string): Promise<{ data: Model[] }> {
    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    return await response.json()
  }
}
