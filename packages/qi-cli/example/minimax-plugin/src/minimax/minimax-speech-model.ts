import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider'
import {
  combineHeaders,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { MiniMaxConfig } from './minimax-config'
import { miniMaxFailedResponseHandler } from './minimax-error'
import {
  MiniMaxMusicAPITypes,
  MiniMaxMusicAPIResponse,
  MiniMaxSpeechAPITypes,
  MiniMaxSpeechAPIResponse
} from './minimax-api-types'
import { MiniMaxSpeechCallOptionsSchema } from './t2a-v2.request.schema'

export const miniMaxSpeechCallOptionsSchema = MiniMaxSpeechCallOptionsSchema
export type MiniMaxSpeechCallOptions = z.infer<typeof miniMaxSpeechCallOptionsSchema>

export class MiniMaxSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3'
  public static readonly speechCallOptionsSchema = miniMaxSpeechCallOptionsSchema

  get provider(): string {
    return this.config.provider
  }

  constructor(
    readonly modelId: string,
    private readonly config: MiniMaxConfig,
  ) { }

  private isMusicModel() {
    return this.modelId.startsWith('music-')
  }

  private hexToUint8Array(hex: string) {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))
  }

  private async getArgs({
    text,
    voice = 'male-qn-qingse',
    outputFormat,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = []

    const miniMaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: MiniMaxSpeechModel.speechCallOptionsSchema,
    })

    const requestBody: MiniMaxSpeechAPITypes = {
      model: this.modelId,
      text,
      voice_setting: {
        voice_id: voice,
        speed,
        ...(miniMaxOptions?.voice_setting || {}),
      } as any,
      ...miniMaxOptions,
    }

    if (outputFormat && !requestBody.audio_setting?.format) {
      requestBody.audio_setting = {
        ...miniMaxOptions?.audio_setting,
        ...requestBody.audio_setting,
        format: outputFormat as any,
      }
    }

    if (requestBody.timber_weights && requestBody.timber_weights.length > 0 && requestBody.voice_setting) {
      requestBody.voice_setting.voice_id = ''
    }

    return {
      requestBody,
      warnings,
    }
  }

  private async getMusicArgs({
    text,
    outputFormat,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = []

    const miniMaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: MiniMaxSpeechModel.speechCallOptionsSchema,
    })

    const requestBody: MiniMaxMusicAPITypes = {
      model: this.modelId as 'music-2.5+' | 'music-2.5',
      prompt: text,
      stream: false,
      output_format: (outputFormat as 'url' | 'hex') || miniMaxOptions?.output_format || 'hex',
      audio_setting: miniMaxOptions?.audio_setting
        ? {
          sample_rate: miniMaxOptions.audio_setting.sample_rate as 16000 | 24000 | 32000 | 44100 | undefined,
          bitrate: miniMaxOptions.audio_setting.bitrate as 32000 | 64000 | 128000 | 256000 | undefined,
          format: miniMaxOptions.audio_setting.format as 'mp3' | 'wav' | 'pcm' | undefined,
        }
        : undefined,
      aigc_watermark: miniMaxOptions?.aigc_watermark,
      lyrics: miniMaxOptions?.lyrics,
      lyrics_optimizer: miniMaxOptions?.lyrics_optimizer,
      is_instrumental: miniMaxOptions?.is_instrumental,
    }

    return {
      requestBody,
      warnings,
    }
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    if (this.isMusicModel()) {
      const { requestBody, warnings } = await this.getMusicArgs(options)

      const { value: responseValue, responseHeaders } = await postJsonToApi<MiniMaxMusicAPIResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/v1/music_generation',
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        body: requestBody,
        failedResponseHandler: miniMaxFailedResponseHandler,
        successfulResponseHandler: async ({ response }) => {
          const json = (await response.json()) as MiniMaxMusicAPIResponse
          if (json.base_resp.status_code !== 0) {
            throw new Error(`MiniMax API Error: ${json.base_resp.status_msg} (${json.base_resp.status_code})`)
          }
          if (!json.data?.audio) {
            throw new Error('MiniMax music generation did not return audio data.')
          }
          return {
            value: json,
            responseHeaders: Object.fromEntries(response.headers.entries()) as Record<string, string>,
          }
        },
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      })

      return {
        audio: this.hexToUint8Array(responseValue.data.audio),
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
          body: responseValue,
        },
      }
    }

    const { requestBody, warnings } = await this.getArgs(options)

    const { value: responseValue, responseHeaders } = await postJsonToApi<MiniMaxSpeechAPIResponse>({
      url: this.config.url({
        modelId: this.modelId,
        path: '/v1/t2a_v2',
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: miniMaxFailedResponseHandler,
      successfulResponseHandler: async ({ response }) => {
        const json = (await response.json()) as MiniMaxSpeechAPIResponse
        if (json.base_resp.status_code !== 0) {
          throw new Error(`MiniMax API Error: ${json.base_resp.status_msg} (${json.base_resp.status_code})`)
        }
        return {
          value: json,
          responseHeaders: Object.fromEntries(response.headers.entries()) as Record<string, string>,
        }
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    return {
      audio: this.hexToUint8Array(responseValue.data.audio),
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
        body: responseValue,
      },
    }
  }
}
