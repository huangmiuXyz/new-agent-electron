import { SpeechModelV3 } from '@ai-sdk/provider';
import {
  combineHeaders,
} from '@ai-sdk/provider-utils';

export interface GenieConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: typeof fetch;
}

export class GenieSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: GenieConfig,
  ) { }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { text, voice, providerOptions } = options;

    const requestBody = {
      character_name: voice || this.modelId,
      text,
      split_sentence: providerOptions?.split_sentence ?? true,
      ...providerOptions,
    };

    const url = `${this.config.baseURL}/tts`;
    const headers = combineHeaders(this.config.headers(), options.headers);

    const response = await (this.config.fetch || fetch)(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Genie TTS API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const audioArrayBuffer = await response.arrayBuffer();
    const audioUint8Array = new Uint8Array(audioArrayBuffer);

    return {
      audio: audioUint8Array,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers.entries()),
        body: requestBody,
      },
    };
  }
}
