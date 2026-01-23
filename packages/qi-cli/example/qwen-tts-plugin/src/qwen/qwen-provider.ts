import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import { QwenSpeechModel } from './qwen-speech-model';
import { Model } from '../types';

export interface QwenProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => QwenSpeechModel;
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

export interface QwenProviderSettings {
  /**
   * Base URL for the Qwen TTS service.
   */
  baseURL?: string;
}

export function createQwen(
  options: QwenProviderSettings = {},
): QwenProvider {
  const baseURL = options.baseURL ?? 'https://qwen-qwen3-tts.ms.show/';

  const createSpeechModel = (modelId: string = 'qwen3-tts-1.7b') =>
    new QwenSpeechModel(modelId, {
      provider: `qwen.speech`,
      baseUrl: baseURL,
    });

  const provider = function () {
    return {
      speech: createSpeechModel,
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  const baseVoices = [
    { id: 'Vivian', name: 'Vivian', description: '明亮、略带锐利感的年轻女声。', language: '中文' },
    { id: 'Serena', name: 'Serena', description: '温暖柔和的年轻女声。', language: '中文' },
    { id: 'Uncle_Fu', name: 'Uncle_Fu', description: '音色低沉醇厚的成熟男声。', language: '中文' },
    { id: 'Dylan', name: 'Dylan', description: '清晰自然的北京青年男声。', language: '中文（北京方言）' },
    { id: 'Eric', name: 'Eric', description: '活泼、略带沙哑明亮感的成都男声。', language: '中文（四川方言）' },
    { id: 'Ryan', name: 'Ryan', description: '富有节奏感的动感男声。', language: '英语' },
    { id: 'Aiden', name: 'Aiden', description: '阳光清晰的美国男声，中频突出。', language: '英语' },
    { id: 'Ono_Anna', name: 'Ono_Anna', description: '轻快灵巧的俏皮日语女声。', language: '日语' },
    { id: 'Sohee', name: 'Sohee', description: '情感丰富的温暖韩语女声。', language: '韩语' },
  ];

  provider.listModels = async () => {
    return [
      {
        id: 'qwen3-tts-1.7b',
        category: 'tts',
        name: 'Qwen3-TTS 1.7B',
        created: Date.now(),
        object: 'model',
        owned_by: 'qwen',
        voices: baseVoices.map((v) => ({
          id: v,
          name: v,
        })),
      },
    ];
  };

  return provider as unknown as QwenProvider;
}
