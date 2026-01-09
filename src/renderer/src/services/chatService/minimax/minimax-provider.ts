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

  return provider satisfies MiniMaxProvider;
}

/**
 * Default MiniMax provider instance.
 */
export const minimax = createMiniMax();
