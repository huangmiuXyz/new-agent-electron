import { LanguageModelV3, NoSuchModelError, ProviderV3 } from '@ai-sdk/provider'
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix
} from '@ai-sdk/provider-utils'
import { AgentQIChatModelId } from './chat/agentqi-chat-options'
import { AgentQIChatLanguageModel } from './chat/agentqi-chat-language-model'
import { VERSION } from './version'

export interface AgentQIProviderSettings {
  /**
   * AgentQI API key.
   */
  apiKey?: string

  /**
   * Base URL for the API calls.
   */
  baseURL?: string

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction
}

export interface AgentQIProvider extends ProviderV3 {
  /**
Creates a AgentQI model for text generation.
*/
  (modelId: AgentQIChatModelId): LanguageModelV3

  /**
Creates a AgentQI model for text generation.
*/
  languageModel(modelId: AgentQIChatModelId): LanguageModelV3

  /**
Creates a AgentQI chat model for text generation.
*/
  chat(modelId: AgentQIChatModelId): LanguageModelV3

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never
}

export function createAgentQI(options: AgentQIProviderSettings = {}): AgentQIProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? 'https://api.agentqi.com')

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'AGENTQI_API_KEY',
          description: 'AgentQI API key'
        })}`,
        ...options.headers
      },
      `ai-sdk/agentqi/${VERSION}`
    )

  const createLanguageModel = (modelId: AgentQIChatModelId) => {
    return new AgentQIChatLanguageModel(modelId, {
      provider: `agentqi.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    })
  }

  const provider = (modelId: AgentQIChatModelId) => createLanguageModel(modelId)

  provider.specificationVersion = 'v3' as const
  provider.languageModel = createLanguageModel
  provider.chat = createLanguageModel

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' })
  }
  provider.textEmbeddingModel = provider.embeddingModel
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' })
  }

  return provider
}

export const agentqi = createAgentQI()
