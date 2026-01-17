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

  private loadingPromises: Map<string, Promise<void>> = new Map();

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { text, voice, providerOptions } = options;
    const characterName = voice || this.modelId;

    if (this.loadingPromises.has(characterName)) {
      await this.loadingPromises.get(characterName);
    } else {
      const loadPromise = (async () => {
        const loadResponse = await (this.config.fetch || fetch)(`${this.config.baseURL}/load_character`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_name: characterName }),
        });

        if (!loadResponse.ok) {
          const errorText = await loadResponse.text();
          throw new Error(`Failed to load character '${characterName}': ${loadResponse.status} ${loadResponse.statusText} - ${errorText}`);
        }

        const result = await loadResponse.json();
        if (result.status === 'error') {
          throw new Error(`Load character error: ${result.message}`);
        }
      })();

      this.loadingPromises.set(characterName, loadPromise);
      try {
        await loadPromise;
      } finally {
        setTimeout(() => this.loadingPromises.delete(characterName), 5000);
      }
    }

    const requestBody = {
      character_name: characterName,
      text,
      split_sentence: providerOptions?.split_sentence ?? true,
      ...providerOptions,
    };

    const url = `${this.config.baseURL}/tts`;
    const headers = combineHeaders(this.config.headers(), options.headers);

    const makeRequest = async () => {
      return await (this.config.fetch || fetch)(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });
    };

    let response = await makeRequest();

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
