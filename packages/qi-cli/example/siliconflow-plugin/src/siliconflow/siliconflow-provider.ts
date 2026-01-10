import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { SiliconFlowSpeechModel } from './siliconflow-speech-model';
import { Model, ModelVoice } from '../types';
import { SiliconFlowGetModelsResp } from './siliconflow-api-types';

const VERSION = '1.0.0';

export interface SiliconFlowProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => SiliconFlowSpeechModel;
  };

  /**
   * Creates a model for speech synthesis.
   */
  speech(modelId?: string): SpeechModelV3;

  /**
   * List of available models.
   */
  listModels: () => Promise<Model[]>;
}

export interface SiliconFlowProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Base URL for the SiliconFlow API requests.
   */
  baseURL?: string;

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
 * Create a SiliconFlow provider instance.
 */
export function createSiliconFlow(
  options: SiliconFlowProviderSettings = {},
): SiliconFlowProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'SILICONFLOW_API_KEY',
          description: 'SiliconFlow',
        })}`,
        ...options.headers,
      },
      `ai-sdk/siliconflow/${VERSION}`,
    );

  const baseURL = options.baseURL ?? 'https://api.siliconflow.cn/v1';

  const createSpeechModel = (modelId: string = 'fishaudio/fish-speech-1.4') =>
    new SiliconFlowSpeechModel(modelId, {
      provider: `siliconflow.speech`,
      url: ({ path }) => `${baseURL}${path}`,
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
  provider.speechCallOptionsSchema = SiliconFlowSpeechModel.speechCallOptionsSchema;

  const baseVoices = [
    'alex',
    'anna',
    'bella',
    'benjamin',
    'charles',
    'claire',
    'david',
    'diana',
  ];

  provider.listModels = async () => {
    try {
      const headers = getHeaders();
      const customFetch = options.fetch ?? fetch;

      const modelsResponse = await customFetch(`${baseURL}/models`, {
        method: 'GET',
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`);
      }

      const modelsData = (await modelsResponse.json()) as SiliconFlowGetModelsResp;

      return modelsData.data.map((m) => {
        const lowerID = m.id.toLowerCase()
        const isSpeech = lowerID.includes('speech') || lowerID.includes('tts') || lowerID.includes('voice');

        let voices: ModelVoice[] | undefined = undefined;
        if (isSpeech) {
          voices = baseVoices.map((v) => ({
            id: `${m.id}:${v}`,
            name: v.charAt(0).toUpperCase() + v.slice(1),
          }));
        }

        return {
          id: m.id,
          category: (isSpeech ? 'speech' : 'text') as 'speech' | 'text',
          name: m.id.split('/').pop() || m.id,
          created: m.created,
          object: 'model',
          owned_by: m.owned_by || 'siliconflow',
          voices,
        };
      });
    } catch (error) {
      console.error('Failed to fetch SiliconFlow models:', error);
      return [];
    }
  };

  return provider satisfies SiliconFlowProvider;
}

/**
 * Default SiliconFlow provider instance.
 */
export const siliconflow = createSiliconFlow();
