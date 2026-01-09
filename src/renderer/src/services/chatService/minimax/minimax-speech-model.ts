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
import { T2aV2RequestSchema } from './t2a-v2.request.schema'
export const miniMaxSpeechCallOptionsSchema = T2aV2RequestSchema

export type MiniMaxSpeechCallOptions = z.infer<typeof miniMaxSpeechCallOptionsSchema>;

export class MiniMaxSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  public static readonly speechCallOptionsSchema = miniMaxSpeechCallOptionsSchema;
  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: MiniMaxConfig,
  ) { }

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
      schema: MiniMaxSpeechModel.speechCallOptionsSchema,
    });

    const requestBody: MiniMaxSpeechAPITypes = {
      model: this.modelId,
      text,
      voice_setting: {
        ...miniMaxOptions!.voice_setting,
        voice_id: voice,
        speed: speed,
      },
      ...miniMaxOptions,
    };

    if (outputFormat && !requestBody.audio_setting?.format) {
      requestBody.audio_setting = {
        ...miniMaxOptions!.audio_setting,
        ...requestBody.audio_setting,
        format: outputFormat as any,
      };
    }

    // 如果提供了 timber_weights，根据 API 要求需要清空 voice_id
    if (requestBody.timber_weights && requestBody.timber_weights.length > 0) {
      if (requestBody.voice_setting) {
        requestBody.voice_setting.voice_id = '';
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
