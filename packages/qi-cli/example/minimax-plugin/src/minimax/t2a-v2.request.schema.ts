import { z } from 'zod'
import './zod-extensions'

export const ModelEnum = z.enum([
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
  'music-2.5+',
  'music-2.5'
]).describe('Supported MiniMax speech or music model id.')

export const EmotionEnum = z.enum([
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
  'fluent',
  'whisper'
])

export const AudioFormatEnum = z.enum([
  'mp3',
  'pcm',
  'flac',
  'wav'
])

export const OutputFormatEnum = z.enum([
  'url',
  'hex'
])

export const LanguageBoostEnum = z.enum([
  'Chinese',
  'Chinese,Yue',
  'English',
  'Arabic',
  'Russian',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Turkish',
  'Dutch',
  'Ukrainian',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Italian',
  'Korean',
  'Thai',
  'Polish',
  'Romanian',
  'Greek',
  'Czech',
  'Finnish',
  'Hindi',
  'Bulgarian',
  'Danish',
  'Hebrew',
  'Malay',
  'Persian',
  'Slovak',
  'Swedish',
  'Croatian',
  'Filipino',
  'Hungarian',
  'Norwegian',
  'Slovenian',
  'Catalan',
  'Nynorsk',
  'Tamil',
  'Afrikaans',
  'auto'
])

export const SoundEffectsEnum = z.enum([
  'spacious_echo',
  'auditorium_echo',
  'lofi_telephone',
  'robotic'
])

const isMusicModel = (data: any) => data?.model?.modelId?.startsWith('music-')
const showForMusic = (data: any) => isMusicModel(data)
const showForSpeech = (data: any) => !isMusicModel(data)

export const T2AStreamOptionSchema = z.object({
  exclude_aggregated_audio: z.boolean().optional()
})

export const T2AVoiceSettingSchema = z.object({
  voice_id: z.string().optional().meta({ ifShow: false }),
  speed: z.number().min(0.5).max(2).optional().meta({ ifShow: false }),
  vol: z.number().gt(0).max(10).optional(),
  pitch: z.number().int().min(-12).max(12).optional(),
  emotion: EmotionEnum.optional(),
  text_normalization: z.boolean().optional(),
  latex_read: z.boolean().optional()
})

export const T2AAudioSettingSchema = z.object({
  sample_rate: z.enum([
    '8000',
    '16000',
    '22050',
    '24000',
    '32000',
    '44100'
  ]).transform((value) => Number(value)).optional()
    .describe('采样率。可选值：`16000`, `24000`, `32000`, `44100`'),
  bitrate: z.enum([
    '32000',
    '64000',
    '128000',
    '256000'
  ]).transform((value) => Number(value)).optional()
    .describe('比特率。可选值：`32000`, `64000`, `128000`, `256000`'),
  format: AudioFormatEnum.optional().describe('音频编码格式。'),
  channel: z.enum(['1', '2']).transform((value) => Number(value)).optional().meta({ ifShow: showForSpeech }),
  force_cbr: z.boolean().optional().meta({ ifShow: showForSpeech })
})

export const PronunciationDictSchema = z.object({
  tone: z.array(z.string()).optional()
})

export const TimbreWeightsSchema = z.object({
  voice_id: z.string(),
  weight: z.number().int().min(1).max(100)
})

export const VoiceModifySchema = z.object({
  pitch: z.number().int().min(-100).max(100).optional(),
  intensity: z.number().int().min(-100).max(100).optional(),
  timbre: z.number().int().min(-100).max(100).optional(),
  sound_effects: SoundEffectsEnum.optional()
})

export const T2aV2RequestSchema = z.object({
  model: ModelEnum.describe('使用的模型名称，可选 `music-2.5+`（推荐）或 `music-2.5`').meta({ ifShow: false }),
  text: z.string().max(10000)
    .describe('音乐描述，对应音乐生成接口中的 `prompt` 字段，用于指定风格、情绪和场景。')
    .meta({ ifShow: false }),
  stream: z.boolean().optional()
    .describe('是否使用流式传输，默认值为 `false`。')
    .meta({ ifShow: false }),
  stream_options: T2AStreamOptionSchema.optional().meta({ ifShow: false }),
  voice_setting: T2AVoiceSettingSchema.optional().meta({ ifShow: showForSpeech }),
  audio_setting: T2AAudioSettingSchema.optional().describe('音频输出配置。'),
  pronunciation_dict: PronunciationDictSchema.optional().meta({ ifShow: showForSpeech }),
  timber_weights: z.array(TimbreWeightsSchema).max(4).optional().meta({ ifShow: showForSpeech }),
  language_boost: LanguageBoostEnum.nullable().optional().meta({ ifShow: showForSpeech }),
  voice_modify: VoiceModifySchema.optional().meta({ ifShow: showForSpeech }),
  subtitle_enable: z.boolean().optional().meta({ ifShow: showForSpeech }),
  output_format: OutputFormatEnum.optional()
    .describe('音频返回格式，可选 `url` 或 `hex`，默认值为 `hex`；当 `stream` 为 `true` 时，仅支持 `hex`。')
    .meta({ ifShow: false }),
  aigc_watermark: z.boolean().optional()
    .describe('是否在音频末尾添加水印，仅在非流式请求时生效。'),
  lyrics: z.string().max(3500).optional()
    .describe('歌曲歌词。使用 `\\n` 分隔每行，可加入 `[Intro]`、`[Verse]`、`[Chorus]` 等结构标签优化生成效果。')
    .meta({ ifShow: showForMusic }),
  lyrics_optimizer: z.boolean().optional()
    .describe('是否根据 `prompt` 描述自动生成歌词。仅 `music-2.5` 和 `music-2.5+` 支持。设为 `true` 且 `lyrics` 为空时，系统会根据 prompt 自动生成歌词。默认值为 `false`。')
    .meta({ ifShow: showForMusic }),
  is_instrumental: z.boolean().optional()
    .describe('是否生成纯音乐（无人声）。仅 `music-2.5+` 支持。设为 `true` 时，`lyrics` 字段非必填。默认值为 `false`。')
    .meta({ ifShow: showForMusic })
})

export const MiniMaxSpeechCallOptionsSchema = T2aV2RequestSchema
  .omit({ model: true, text: true })
  .partial()

export type T2aV2Request = z.infer<typeof T2aV2RequestSchema>
