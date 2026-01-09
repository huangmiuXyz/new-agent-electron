import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MiniMaxConfig } from './minimax-config';
import { miniMaxFailedResponseHandler } from './minimax-error';
import { MiniMaxSpeechAPITypes, MiniMaxSpeechAPIResponse } from './minimax-api-types';

const miniMaxSpeechCallOptionsSchema = z.object({
  voice_setting: z
    .object({
      voice_id: z.string().optional(),
      speed: z.number().optional(),
      vol: z.number().optional(),
      pitch: z.number().optional(),
      emotion: z.string().optional(),
    })
    .optional(),
  pronunciation_dict: z
    .object({
      tone: z.array(z.string()).optional(),
    })
    .optional(),
  audio_setting: z
    .object({
      sample_rate: z.number().optional(),
      bitrate: z.number().optional(),
      format: z.enum(['mp3', 'wav', 'pcm', 'flac']).optional(),
      channel: z.number().optional(),
    })
    .optional(),
  subtitle_enable: z.boolean().optional(),
});

export type MiniMaxSpeechCallOptions = z.infer<typeof miniMaxSpeechCallOptionsSchema>;

export class MiniMaxSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: MiniMaxConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'male-qn-qingse',
    outputFormat,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const miniMaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: miniMaxSpeechCallOptionsSchema,
    });

    const requestBody: MiniMaxSpeechAPITypes = {
      model: this.modelId,
      text,
      stream: false,
      voice_setting: {
        voice_id: voice,
        speed: speed ?? 1.0,
        vol: 1.0,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    };

    if (outputFormat && ['mp3', 'wav', 'pcm', 'flac'].includes(outputFormat)) {
      requestBody.audio_setting!.format = outputFormat as any;
    }

    if (miniMaxOptions) {
      if (miniMaxOptions.voice_setting) {
        requestBody.voice_setting = {
          voice_id: miniMaxOptions.voice_setting.voice_id ?? voice,
          speed: miniMaxOptions.voice_setting.speed ?? speed ?? 1.0,
          vol: miniMaxOptions.voice_setting.vol ?? 1.0,
          pitch: miniMaxOptions.voice_setting.pitch ?? 0,
          emotion: miniMaxOptions.voice_setting.emotion,
        };
      }
      if (miniMaxOptions.pronunciation_dict) {
        requestBody.pronunciation_dict = miniMaxOptions.pronunciation_dict;
      }
      if (miniMaxOptions.audio_setting) {
        requestBody.audio_setting = {
          ...requestBody.audio_setting,
          ...miniMaxOptions.audio_setting,
        };
      }
      if (miniMaxOptions.subtitle_enable !== undefined) {
        requestBody.subtitle_enable = miniMaxOptions.subtitle_enable;
      }
    }

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const { requestBody, warnings } = await this.getArgs(options);

    const { value: responseValue, responseHeaders } = await postJsonToApi<MiniMaxSpeechAPIResponse>({
      url: this.config.url({
        modelId: this.modelId,
        path: '/v1/t2a_v2',
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: miniMaxFailedResponseHandler,
      successfulResponseHandler: async ({ response }) => {
        const json = (await response.json()) as MiniMaxSpeechAPIResponse;
        if (json.base_resp.status_code !== 0) {
          throw new Error(
            `MiniMax API Error: ${json.base_resp.status_msg} (${json.base_resp.status_code})`,
          );
        }
        return {
          value: json,
          responseHeaders: Object.fromEntries(response.headers.entries()) as Record<
            string,
            string
          >,
        };
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const audioHex = responseValue.data.audio;
    const audioUint8Array = new Uint8Array(
      audioHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)),
    );

    return {
      audio: audioUint8Array,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
        body: responseValue,
      },
    };
  }
}
