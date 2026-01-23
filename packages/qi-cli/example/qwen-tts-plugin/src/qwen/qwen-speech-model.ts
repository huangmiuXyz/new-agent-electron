import { SpeechModelV3 } from '@ai-sdk/provider';
import { Client } from "@gradio/client";

export interface QwenConfig {
  provider: string;
  baseUrl: string;
}

export class QwenSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  constructor(
    readonly modelId: string,
    private readonly config: QwenConfig,
  ) { }

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { text, voice, language } = options;

    // Default values based on the user's snippet
    const speaker = voice || "Vivian";
    const lang = language || "Chinese";
    const modelSize = "1.7B"; // From snippet
    const instruct = "Hello!!"; // From snippet

    try {
      const client = await Client.connect(this.config.baseUrl);
      const result = await client.predict("/generate_custom_voice", {
        text,
        language: lang,
        speaker,
        instruct,
        model_size: modelSize,
      }) as any;

      if (!result.data || !result.data[0]) {
        throw new Error("Empty response from Qwen TTS service");
      }

      const audioData = result.data[0];
      let audioUint8Array: Uint8Array;

      if (typeof audioData === 'string') {
        // Handle direct string response if applicable
        if (audioData.startsWith('data:')) {
          const base64 = audioData.split(',')[1];
          audioUint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        } else {
          // Assume it's a URL
          const response = await fetch(audioData);
          const buffer = await response.arrayBuffer();
          audioUint8Array = new Uint8Array(buffer);
        }
      } else if (audioData.data) {
        // Handle object with data property (base64)
        const base64 = audioData.data.startsWith('data:') ? audioData.data.split(',')[1] : audioData.data;
        audioUint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      } else if (audioData.url) {
        // Handle object with url property
        const response = await fetch(audioData.url);
        const buffer = await response.arrayBuffer();
        audioUint8Array = new Uint8Array(buffer);
      } else {
        console.error('Unexpected audio data format:', audioData);
        throw new Error("Unexpected audio data format from Qwen TTS service");
      }

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
