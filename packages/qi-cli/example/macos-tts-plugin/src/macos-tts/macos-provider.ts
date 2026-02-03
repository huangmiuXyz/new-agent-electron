import { SpeechModelV3, ProviderV3 } from '@ai-sdk/provider';
import { MacOSSpeechModel } from './macos-speech-model';
import type { Model, PluginContext } from '@agent-qi/types';

export interface MacOSProvider extends Pick<ProviderV3, 'speechModel'> {
  (settings?: {}): {
    speech: (modelId?: string) => MacOSSpeechModel;
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

interface MacOSVoice {
  id: string;
  name: string;
  lang: string;
  description: string;
}

export function createMacOSProvider(context: PluginContext): MacOSProvider {
  const createSpeechModel = (modelId: string = 'macos-say') =>
    new MacOSSpeechModel(modelId, context);

  const provider = function () {
    return {
      speech: createSpeechModel,
    };
  } as unknown as MacOSProvider;

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.listModels = async () => {
    try {
      const exec = context.api.exec;
      const voicesOutput: string = await new Promise((resolve, reject) => {
        exec('say -v ?', (error: Error | null, stdout: string) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });

      // say -v ? output format:
      // Alex                en_US    # Most people recognize me by my voice.
      // Alice               it_IT    # Ciao, mi chiamo Alice e sono una voce italiana.
      const voices = voicesOutput
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          // 更加健壮的解析逻辑，匹配：名称 语言代码 # 描述
          const match = line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#\s+(.*)$/);
          if (match) {
            return {
              id: match[1].trim(),
              name: match[1].trim(),
              lang: match[2],
              description: match[3],
            };
          }
          return null;
        })
        .filter((v): v is MacOSVoice => v !== null);

      return [
        {
          id: 'macos-say',
          name: 'MacOS Native (say)',
          category: 'tts' as const,
          object: 'model',
          created: Date.now(),
          active: true,
          owned_by: 'apple',
          voices: voices.map((v) => ({
            id: v.id,
            name: `${v.name} (${v.lang})`,
          })),
        },
      ];
    } catch (error) {
      console.error('Failed to list MacOS voices:', error);
      return [];
    }
  };

  return provider as MacOSProvider;
}
