import { SpeechModelV3 } from '@ai-sdk/provider';
import { z } from 'zod';
import type { PluginContext } from '@agent-qi/types';

export const macosSpeechProviderOptionsSchema = z.object({});

export type MacOSSpeechModelOptions = z.infer<typeof macosSpeechProviderOptionsSchema>;

export class MacOSSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  public static readonly speechCallOptionsSchema = macosSpeechProviderOptionsSchema;

  constructor(
    readonly modelId: string,
    private readonly context: PluginContext,
  ) { }

  get provider(): string {
    return 'macos-tts';
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { text, voice, speed = 1.0 } = options;
    const api = this.context.api;
    const fs = api.fs;
    const path = api.path;
    const os = api.os;
    const exec = api.exec;

    const tempFile = path.join(os.tmpdir(), `macos-tts-${Date.now()}.wav`);

    try {
      let command = `say`;
      if (voice) {
        command += ` -v "${voice}"`;
      }
      const rate = Math.floor(speed * 180);
      command += ` -r ${rate}`;

      command += ` "${text.replace(/"/g, '\\"')}" -o "${tempFile}" --data-format=LEI16@44100`;

      await new Promise((resolve, reject) => {
        exec(command, (error: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(null);
          }
        });
      });

      const audioBuffer = fs.readFileSync(tempFile);
      const audioUint8Array = new Uint8Array(audioBuffer);

      // Cleanup
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
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
      console.error('MacOS TTS failed:', error);
      // Cleanup on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw error;
    }
  }
}
