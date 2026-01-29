import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { KokoroSpeechModel } from './kokoro-speech-model';
import { KokoroVoiceInfo, KokoroListVoicesResponse } from './kokoro-api-types';
import { Model, ModelVoice } from '../types';

const VERSION = '1.0.0';

// Voice mapping from Kokoro model
export const DEFAULT_VOICES: KokoroVoiceInfo[] = [
  // English female voices
  { id: 'af_maple', name: 'Maple (English Female)', language: 'en', gender: 'female', description: 'American female voice' },
  { id: 'af_sol', name: 'Sol (English Female)', language: 'en', gender: 'female', description: 'American female voice' },
  { id: 'bf_vale', name: 'Vale (English Female)', language: 'en', gender: 'female', description: 'British female voice' },
  // Chinese female voices
  { id: 'zf_001', name: '中文女声 001', language: 'zh', gender: 'female', description: '标准中文女声' },
  { id: 'zf_002', name: '中文女声 002', language: 'zh', gender: 'female', description: '温柔中文女声' },
  { id: 'zf_003', name: '中文女声 003', language: 'zh', gender: 'female', description: '活泼中文女声' },
  { id: 'zf_004', name: '中文女声 004', language: 'zh', gender: 'female', description: '成熟中文女声' },
  { id: 'zf_005', name: '中文女声 005', language: 'zh', gender: 'female', description: '甜美中文女声' },
  { id: 'zf_006', name: '中文女声 006', language: 'zh', gender: 'female', description: '清晰中文女声' },
  { id: 'zf_007', name: '中文女声 007', language: 'zh', gender: 'female', description: '自然中文女声' },
  { id: 'zf_008', name: '中文女声 008', language: 'zh', gender: 'female', description: '优雅中文女声' },
  // Chinese male voices
  { id: 'zm_009', name: '中文男声 009', language: 'zh', gender: 'male', description: '标准中文男声' },
  { id: 'zm_010', name: '中文男声 010', language: 'zh', gender: 'male', description: '磁性中文男声' },
  { id: 'zm_011', name: '中文男声 011', language: 'zh', gender: 'male', description: '成熟中文男声' },
  { id: 'zm_012', name: '中文男声 012', language: 'zh', gender: 'male', description: '年轻中文男声' },
  { id: 'zm_013', name: '中文男声 013', language: 'zh', gender: 'male', description: '稳重中文男声' },
  { id: 'zm_014', name: '中文男声 014', language: 'zh', gender: 'male', description: '活力中文男声' },
  { id: 'zm_015', name: '中文男声 015', language: 'zh', gender: 'male', description: '深沉中文男声' },
  { id: 'zm_016', name: '中文男声 016', language: 'zh', gender: 'male', description: '温和中文男声' },
];

export interface KokoroProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => KokoroSpeechModel;
  };

  /**
   * Creates a model for speech synthesis.
   */
  speech(modelId?: string): SpeechModelV3;

  /**
   * List of available models.
   */
  listModels: () => Promise<Model[]>;

  /**
   * List of available voices.
   */
  listVoices: () => Promise<KokoroVoiceInfo[]>;
}

export interface KokoroProviderSettings {
  /**
   * Base URL for the Kokoro TTS server.
   * Default: http://localhost:8000
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

  /**
   * Auto-start configuration.
   */
  autoStart?: {
    enabled: boolean;
    port: number;
    basePath: string;
    spawn: (command: string, args: string[], options: any) => any;
    platform: string;
    pathJoin: (...paths: string[]) => string;
    notification: {
      info: (content: string, title?: string) => void;
      success: (content: string, title?: string) => void;
      error: (content: string, title?: string) => void;
      loading: (content: string, title?: string, duration?: number) => void;
      removeStatus: (id: string) => void;
    };
  };
}

/**
 * Create a Kokoro provider instance.
 */
export function createKokoro(
  options: KokoroProviderSettings = {},
): KokoroProvider {
  const baseURL = options.baseURL ?? 'http://localhost:18889';

  const getHeaders = () => ({
    ...options.headers,
  });

  const createSpeechModel = (modelId: string = 'kokoro-v1.1-zh') =>
    new KokoroSpeechModel(modelId, {
      provider: `kokoro.speech`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      autoStart: options.autoStart,
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
      id: 'kokoro-v1.1-zh',
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
      const response = await fetch(`${baseURL}/voices`, {
        method: 'GET',
        headers: getHeaders(),
      });

      if (!response.ok) {
        return DEFAULT_VOICES;
      }

      const result = (await response.json()) as KokoroListVoicesResponse;
      return result.voices || DEFAULT_VOICES;
    } catch (error) {
      console.error('Failed to fetch Kokoro voices:', error);
      return DEFAULT_VOICES;
    }
  };

  provider.listModels = async () => {
    const voices = await provider.listVoices();
    return defaultModels.map((m) => ({
      ...m,
      voices: voices.map((v): ModelVoice => ({ id: v.id, name: v.name })),
    }));
  };

  return provider satisfies KokoroProvider;
}

/**
 * Default Kokoro provider instance.
 */
export const kokoro = createKokoro();
