import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import { KokoroSpeechModel } from './kokoro-speech-model';
import type { KokoroVoiceInfo } from './kokoro-api-types';
import type { Model } from '@agent-qi/types';

export const DEFAULT_VOICES: KokoroVoiceInfo[] = [
  { id: 'af_heart', name: 'Heart', language: 'en', gender: 'female' },
  { id: 'af_alloy', name: 'Alloy', language: 'en', gender: 'female' },
  { id: 'af_aoede', name: 'Aoede', language: 'en', gender: 'female' },
  { id: 'af_bella', name: 'Bella', language: 'en', gender: 'female' },
  { id: 'af_jessica', name: 'Jessica', language: 'en', gender: 'female' },
  { id: 'af_kore', name: 'Kore', language: 'en', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', language: 'en', gender: 'female' },
  { id: 'af_nova', name: 'Nova', language: 'en', gender: 'female' },
  { id: 'af_river', name: 'River', language: 'en', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', language: 'en', gender: 'female' },
  { id: 'af_sky', name: 'Sky', language: 'en', gender: 'female' },
  { id: 'am_adam', name: 'Adam', language: 'en', gender: 'male' },
  { id: 'am_echo', name: 'Echo', language: 'en', gender: 'male' },
  { id: 'am_eric', name: 'Eric', language: 'en', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'en', gender: 'male' },
  { id: 'am_liam', name: 'Liam', language: 'en', gender: 'male' },
  { id: 'am_michael', name: 'Michael', language: 'en', gender: 'male' },
  { id: 'am_onyx', name: 'Onyx', language: 'en', gender: 'male' },
  { id: 'am_puck', name: 'Puck', language: 'en', gender: 'male' },
  { id: 'am_santa', name: 'Santa', language: 'en', gender: 'male' },
  { id: 'bf_emma', name: 'Emma', language: 'en', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en', gender: 'female' },
  { id: 'bf_alice', name: 'Alice', language: 'en', gender: 'female' },
  { id: 'bf_lily', name: 'Lily', language: 'en', gender: 'female' },
  { id: 'bm_george', name: 'George', language: 'en', gender: 'male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en', gender: 'male' },
  { id: 'bm_daniel', name: 'Daniel', language: 'en', gender: 'male' },
  { id: 'bm_fable', name: 'Fable', language: 'en', gender: 'male' },
];

export interface KokoroProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => KokoroSpeechModel;
  };
  speech(modelId?: string): SpeechModelV3;
  listModels: () => Promise<Model[]>;
  listVoices: () => Promise<KokoroVoiceInfo[]>;
}

export interface KokoroProviderSettings {
  invokeIPC: (channel: string, ...args: any[]) => Promise<any>;
}

export function createKokoro(
  options: KokoroProviderSettings,
): KokoroProvider {
  const createSpeechModel = (modelId: string = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX') =>
    new KokoroSpeechModel(modelId, {
      provider: `kokoro.speech`,
      invokeIPC: options.invokeIPC,
    });

  const provider = function () {
    return {
      speech: createSpeechModel,
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  const defaultModels: Model[] = [
    {
      id: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
      category: 'tts',
      name: 'Kokoro v1.1 中文',
      created: 1706745600,
      object: 'model',
      owned_by: 'kokoro',
      voices: DEFAULT_VOICES.map((v) => ({ id: v.id, name: v.name })),
    },
  ];

  provider.listVoices = async () => {
    try {
      const voices = await options.invokeIPC('voices');
      return voices as KokoroVoiceInfo[];
    } catch {
      return DEFAULT_VOICES;
    }
  };

  provider.listModels = async () => {
    const voices = await provider.listVoices();
    return defaultModels.map((m) => ({
      ...m,
      voices: voices.map((v) => ({ id: v.id, name: v.name })),
    }));
  };

  return provider satisfies KokoroProvider;
}
