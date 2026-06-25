import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import { KokoroConfig, KokoroSpeechCallOptions } from './kokoro-config';

export class KokoroSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: KokoroConfig,
  ) {}

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
        text,
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

    try {
      const audioUint8Array: Uint8Array = await this.config.invokeIPC('tts', requestBody);

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
