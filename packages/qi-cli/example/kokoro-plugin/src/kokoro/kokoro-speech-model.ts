import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import { KokoroConfig, KokoroSpeechCallOptions } from './kokoro-config';
import removeMd from 'remove-markdown';

export const STORAGE_KEY = 'kokoro_plugin_settings';

export interface KokoroPluginSettings {
  timeoutMs: number;
  modelId: string;
  dtype: string;
  device: string;
}

export const DEFAULT_SETTINGS: KokoroPluginSettings = {
  timeoutMs: 60000,
  modelId: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
  dtype: 'q8',
  device: 'cpu',
};

export class KokoroSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: KokoroConfig,
  ) {}

  private cleanText(text: string): string {
    return removeMd(text, { stripListLeaders: true, useImgAltText: false })
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private async getArgs({
    text,
    voice = 'af_heart',
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];
    const kokoroOptions = providerOptions?.kokoro as KokoroSpeechCallOptions | undefined;

    return {
      requestBody: {
        text: this.cleanText(text),
        voice: voice || 'af_heart',
        speed: speed ?? kokoroOptions?.speed ?? 1.0,
      },
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { requestBody, warnings } = await this.getArgs(options);

    if (!requestBody.text) {
      throw new Error(`Kokoro TTS text is empty: "${String(requestBody.text)}"`);
    }

    try {
      let settings = DEFAULT_SETTINGS;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch {}

      const audioUint8Array: Uint8Array = await this.config.invokeIPC('tts', {
        ...requestBody,
        modelId: settings.modelId,
        dtype: settings.dtype,
        device: settings.device,
      });

      return {
        audio: audioUint8Array,
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: {},
          body: requestBody,
        },
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Kokoro TTS failed: ${String(error)}`);
    }
  }
}
