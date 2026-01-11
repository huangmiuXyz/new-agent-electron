import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  parseProviderOptions,
} from '@ai-sdk/provider-utils';
import { SiliconFlowConfig } from './siliconflow-config';
import { siliconFlowFailedResponseHandler } from './siliconflow-error';
import { SiliconFlowSpeechAPITypes } from './siliconflow-api-types';
import { siliconFlowSpeechProviderOptionsSchema } from './siliconflow-schema';

export class SiliconFlowSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  public static readonly speechCallOptionsSchema = siliconFlowSpeechProviderOptionsSchema;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: SiliconFlowConfig,
  ) { }

  private async getArgs({
    text,
    voice = 'fnlp/MOSS-TTSD-v0.5:alex',
    outputFormat,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const siliconFlowOptions = await parseProviderOptions({
      provider: 'siliconflow',
      providerOptions,
      schema: SiliconFlowSpeechModel.speechCallOptionsSchema,
    });

    const requestBody: SiliconFlowSpeechAPITypes = {
      model: this.modelId,
      input: text,
      voice: voice,
      speed: speed ?? siliconFlowOptions?.speed,
      response_format: (outputFormat as any) ?? siliconFlowOptions?.response_format,
      ...siliconFlowOptions,
    };

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { requestBody, warnings } = await this.getArgs(options);

    const url = this.config.url({
      modelId: this.modelId,
      path: '/audio/speech',
    });

    const headers = combineHeaders(this.config.headers(), options.headers);

    const response = await (this.config.fetch ?? fetch)(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      await siliconFlowFailedResponseHandler({
        response,
        url,
        requestBodyValues: requestBody,
      });
    }

    const audioBuffer = await response.arrayBuffer();
    const audioUint8Array = new Uint8Array(audioBuffer);

    return {
      audio: audioUint8Array,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }
}
