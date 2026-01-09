import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { MiniMaxSpeechModel } from './minimax-speech-model';
const VERSION = '1.0.0'
export interface MiniMaxProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => MiniMaxSpeechModel;
  };

  /**
   * Creates a model for speech synthesis.
   */
  speech(modelId?: string): SpeechModelV3;

  /**
   * List of available models.
   */
  listModels: Model[];
}

export interface MiniMaxProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

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
 * Create a MiniMax provider instance.
 */
export function createMiniMax(
  options: MiniMaxProviderSettings = {},
): MiniMaxProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax',
        })}`,
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    );

  const createSpeechModel = (modelId: string = 'speech-2.6-hd') =>
    new MiniMaxSpeechModel(modelId, {
      provider: `minimax.speech`,
      url: () => `https://api.minimaxi.com/v1/t2a_v2`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    return {
      speech: createSpeechModel,
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.listModels = [{
    id: 'speech-2.6-hd',
    category: 'speech',
    name: 'MiniMax Speech 2.6 HD',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  },
  {
    id: 'speech-2.6-turbo',
    category: 'speech',
    name: 'MiniMax Speech 2.6 Turbo',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  },
  {
    id: 'speech-02-hd',
    category: 'speech',
    name: 'MiniMax Speech 02 HD',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  },
  {
    id: 'speech-02-turbo',
    category: 'speech',
    name: 'MiniMax Speech 02 Turbo',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  },
  {
    id: 'speech-01-hd',
    category: 'speech',
    name: 'MiniMax Speech 01 HD',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  },
  {
    id: 'speech-01-turbo',
    category: 'speech',
    name: 'MiniMax Speech 01 Turbo',
    created: 1694521600,
    object: 'model',
    owned_by: 'minimax',
  }
  ] as Model[];
  return provider satisfies MiniMaxProvider;
}

/**
 * Default MiniMax provider instance.
 */
export const minimax = createMiniMax();
