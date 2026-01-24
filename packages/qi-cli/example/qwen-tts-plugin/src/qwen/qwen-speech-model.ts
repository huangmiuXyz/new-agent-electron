import { SpeechModelV3 } from '@ai-sdk/provider';
import { Client } from "@gradio/client";
import { qwenSpeechProviderOptionsSchema } from './qwen-schema';
import { parseProviderOptions } from '@ai-sdk/provider-utils';

export interface QwenConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
}

export class QwenSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  public static readonly speechCallOptionsSchema = qwenSpeechProviderOptionsSchema;

  constructor(
    readonly modelId: string,
    private readonly config: QwenConfig,
  ) { }

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs(options: Parameters<SpeechModelV3['doGenerate']>[0]) {

    const { voice, language, providerOptions, text } = options;

    const qwenOptions = await parseProviderOptions({
      provider: 'qwen-tts',
      providerOptions,
      schema: QwenSpeechModel.speechCallOptionsSchema,
    });

    const speaker = voice
    const lang = language
    const modelSize = qwenOptions?.model_size
    const instruct = text

    return {
      speaker,
      lang,
      modelSize,
      instruct,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { text } = options;
    const { speaker, lang, modelSize, instruct } = await this.getArgs(options);

    try {
      const client = await Client.connect(this.config.baseUrl, {
        headers: {
          'x-studio-token': this.config.apiKey,
        }
      });
      const result = await client.predict("/generate_custom_voice", {
        text,
        language: lang === 'auto' ? 'Auto' : lang,
        speaker,
        instruct,
        model_size: modelSize,
      }) as any;

      if (!result.data || !result.data[0]) {
        throw new Error("Empty response from Qwen TTS service");
      }
      const audioData = result.data[0];
      let audioUint8Array: Uint8Array;

      const response = await fetch(audioData.url);
      const buffer = await response.arrayBuffer();
      audioUint8Array = new Uint8Array(buffer);

      return {
        audio: audioUint8Array,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
        },
      };
    } catch (error) {
      console.error('Qwen TTS failed:', error);
      throw error;
    }
  }
}
