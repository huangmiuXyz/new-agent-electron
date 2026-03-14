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

export const T2AStreamOptionSchema = z.object({
  exclude_aggregated_audio: z.boolean().optional()
})

export const T2AVoiceSettingSchema = z.object({
  voice_id: z.string().meta({ ifShow: false }),
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
  ]).transform((value) => Number(value)).optional(),
  bitrate: z.enum([
    '32000',
    '64000',
    '128000',
    '256000'
  ]).transform((value) => Number(value)).optional(),
  format: AudioFormatEnum.optional(),
  channel: z.enum(['1', '2']).transform((value) => Number(value)).optional(),
  force_cbr: z.boolean().optional()
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
  model: ModelEnum.meta({ ifShow: false }),
  text: z.string().max(10000).meta({ ifShow: false }),
  stream: z.boolean().optional().meta({ ifShow: false }),
  stream_options: T2AStreamOptionSchema.optional().meta({ ifShow: false }),
  voice_setting: T2AVoiceSettingSchema.optional(),
  audio_setting: T2AAudioSettingSchema.optional(),
  pronunciation_dict: PronunciationDictSchema.optional(),
  timber_weights: z.array(TimbreWeightsSchema).max(4).optional(),
  language_boost: LanguageBoostEnum.nullable().optional(),
  voice_modify: VoiceModifySchema.optional(),
  subtitle_enable: z.boolean().optional(),
  output_format: OutputFormatEnum.optional().meta({ ifShow: false }),
  aigc_watermark: z.boolean().optional(),
  lyrics: z.string().max(3500).optional(),
  lyrics_optimizer: z.boolean().optional(),
  is_instrumental: z.boolean().optional()
})

export type T2aV2Request = z.infer<typeof T2aV2RequestSchema>
