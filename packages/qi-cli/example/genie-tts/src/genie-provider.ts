import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import { GenieSpeechModel } from './genie-speech-model';
import { Model } from './types';

export interface GenieProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: GenieProviderSettings): {
    speech: (modelId?: string) => GenieSpeechModel;
  };
  speech(modelId?: string): SpeechModelV3;
  listModels: () => Promise<Model[]>;
}

export interface GenieProviderSettings {
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export function createGenie(
  options: GenieProviderSettings = {},
): GenieProvider {
  const baseURL = options.baseURL ?? 'http://127.0.0.1:8000';

  const createSpeechModel = (modelId: string = 'genie-tts') =>
    new GenieSpeechModel(modelId, {
      provider: `genie.speech`,
      baseURL,
      headers: () => options.headers ?? {},
      fetch: options.fetch,
    });

  const provider = function () {
    return {
      speech: createSpeechModel,
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.listModels = async () => {
    return [
      {
        id: 'mika',
        category: 'tts',
        name: 'Mika (聖園ミカ)',
      },
      {
        id: '37',
        category: 'tts',
        name: 'ThirtySeven (37)',
      },
      {
        id: 'feibi',
        category: 'tts',
        name: 'Feibi (菲比)',
      }
    ] as Model[];
  };

  return provider as unknown as GenieProvider;
}
