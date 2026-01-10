import { z } from "zod";
import "./zod-extensions";

/* =========================
 * Enum
 * ========================= */

export const ModelEnum = z.enum([
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
]).describe(
  "请求的模型版本，可选范围：`speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo`, `speech-01-hd`, `speech-01-turbo`."
);

export const EmotionEnum = z.enum([
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
  "calm",
  "fluent",
  "whisper",
]);

export const AudioFormatEnum = z.enum([
  "mp3",
  "pcm",
  "flac",
  "wav",
]);

export const OutputFormatEnum = z.enum([
  "url",
  "hex",
]);

export const LanguageBoostEnum = z.enum([
  "Chinese",
  "Chinese,Yue",
  "English",
  "Arabic",
  "Russian",
  "Spanish",
  "French",
  "Portuguese",
  "German",
  "Turkish",
  "Dutch",
  "Ukrainian",
  "Vietnamese",
  "Indonesian",
  "Japanese",
  "Italian",
  "Korean",
  "Thai",
  "Polish",
  "Romanian",
  "Greek",
  "Czech",
  "Finnish",
  "Hindi",
  "Bulgarian",
  "Danish",
  "Hebrew",
  "Malay",
  "Persian",
  "Slovak",
  "Swedish",
  "Croatian",
  "Filipino",
  "Hungarian",
  "Norwegian",
  "Slovenian",
  "Catalan",
  "Nynorsk",
  "Tamil",
  "Afrikaans",
  "auto",
]);

export const SoundEffectsEnum = z.enum([
  "spacious_echo",
  "auditorium_echo",
  "lofi_telephone",
  "robotic",
]);

/* =========================
 * Sub Schemas
 * ========================= */

export const T2AStreamOptionSchema = z.object({
  exclude_aggregated_audio: z.boolean().optional().describe(
    "设置最后一个 chunk 是否包含拼接后的语音 hex 数据。默认值为 False，即最后一个 chunk 中包含拼接后的完整语音 hex 数据"
  ),
});

export const T2AVoiceSettingSchema = z.object({
  voice_id: z.string().describe(
    "合成音频的音色编号。若需要设置混合音色，请设置 timbre_weights 参数，本参数设置为空值。支持系统音色、复刻音色以及文生音色三种类型。系统支持的全部音色可查看 [系统音色列表](/faq/system-voice-id)，也可使用 [查询可用音色 API](/api-reference/voice-management-get) 查询系统支持的全部音色"
  ).hidden(),
  speed: z.number().min(0.5).max(2).optional().describe(
    "合成音频的语速，取值越大，语速越快。取值范围 `[0.5,2]`，默认值为1.0"
  ).hidden(),
  vol: z.number().gt(0).max(10).optional().describe(
    "合成音频的音量，取值越大，音量越高。取值范围 `(0,10]`，默认值为 1.0"
  ),
  pitch: z.number().int().min(-12).max(12).optional().describe(
    "合成音频的语调，取值范围 `[-12,12]`，默认值为 0，其中 0 为原音色输出"
  ),
  emotion: EmotionEnum.optional().describe(
    "控制合成语音的情绪，参数范围 `[\"happy\", \"sad\", \"angry\", \"fearful\", \"disgusted\", \"surprised\", \"calm\", \"fluent\", \"whisper\"]`"
  ),
  text_normalization: z.boolean().optional().describe(
    "是否启用中文、英语文本规范化，开启后可提升数字阅读场景的性能，但会略微增加延迟，默认值为 false"
  ),
  latex_read: z.boolean().optional().describe(
    "控制是否朗读 latex 公式，默认为 false。需使用 $$ 包裹公式，且 \\ 需转义为 \\\\"
  ),
});

export const T2AAudioSettingSchema = z.object({
  sample_rate: z
    .union([
      z.literal(8000),
      z.literal(16000),
      z.literal(22050),
      z.literal(24000),
      z.literal(32000),
      z.literal(44100),
    ])
    .optional()
    .describe(
      "生成音频的采样率。可选范围`[8000，16000，22050，24000，32000，44100]`，默认为 `32000`"
    ),
  bitrate: z
    .union([
      z.literal(32000),
      z.literal(64000),
      z.literal(128000),
      z.literal(256000),
    ])
    .optional()
    .describe(
      "生成音频的比特率。可选范围`[32000，64000，128000，256000]`，默认值为 `128000`。该参数仅对 `mp3` 格式的音频生效"
    ),
  format: AudioFormatEnum.optional().describe(
    "生成音频的格式，`wav` 仅在非流式输出下支持"
  ),
  channel: z
    .union([z.literal(1), z.literal(2)])
    .optional()
    .describe(
      "生成音频的声道数。可选范围：`[1,2]`，其中 `1` 为单声道，`2` 为双声道，默认值为 1"
    ),
  force_cbr: z.boolean().optional().describe(
    "对于音频恒定比特率（cbr）控制，可选 `false`、 `true`。当此参数设置为 `true`，将以恒定比特率方式进行音频编码。注意：本参数仅当音频设置为**流式**输出，且音频格式为 `mp3` 时生效。"
  ),
});

export const PronunciationDictSchema = z.object({
  tone: z.array(z.string()).optional().describe(
    "定义需要特殊标注的文字或符号对应的注音或发音替换规则。在中文文本中，声调用数字表示：一声为 1，二声为 2，三声为 3，四声为 4，轻声为 5\n示例如下：\n`[\"燕少飞/(yan4)(shao3)(fei1)\", \"omg/oh my god\"]`"
  ),
});

export const TimbreWeightsSchema = z.object({
  voice_id: z.string().describe(
    "合成音频的音色编号，须和weight参数同步填写。支持系统音色、复刻音色以及文生音色三种类型。系统支持的全部音色可查看 [系统音色列表](/faq/system-voice-id)，也可使用 [查询可用音色 API](/api-reference/voice-management-get) 查询系统支持的全部音色"
  ),
  weight: z.number().int().min(1).max(100).describe(
    "合成音频各音色所占的权重，须与 voice_id 同步填写。可选值范围为[1, 100]，最多支持 4 种音色混合，单一音色取值占比越高，合成音色与该音色相似度越高."
  ),
});

export const VoiceModifySchema = z.object({
  pitch: z.number().int().min(-100).max(100).optional().describe(
    "音高调整（低沉/明亮），范围 [-100,100]"
  ),
  intensity: z.number().int().min(-100).max(100).optional().describe(
    "强度调整（力量感/柔和），范围 [-100,100]"
  ),
  timbre: z.number().int().min(-100).max(100).optional().describe(
    "音色调整（磁性/清脆），范围 [-100,100]"
  ),
  sound_effects: SoundEffectsEnum.optional().describe(
    "音效设置，单次仅能选择一种"
  ),
});

/* =========================
 * Request
 * ========================= */

export const T2aV2RequestSchema = z.object({
  model: ModelEnum.hidden(),
  text: z.string().max(10000).describe(
    "需要合成语音的文本，长度限制小于 10000 字符，若文本长度大于 3000 字符，推荐使用流式输出"
  ).hidden(),
  stream: z.boolean().optional().hidden().describe(
    "控制是否流式输出。默认 false，即不开启流式"
  ),
  stream_options: T2AStreamOptionSchema.optional().hidden(),
  voice_setting: T2AVoiceSettingSchema.optional(),
  audio_setting: T2AAudioSettingSchema.optional(),
  pronunciation_dict: PronunciationDictSchema.optional(),
  timber_weights: z.array(TimbreWeightsSchema).max(4).optional(),
  language_boost: LanguageBoostEnum.nullable().optional().describe(
    "是否增强对指定的小语种和方言的识别能力。默认值为 `null`，可设置为 `auto` 让模型自主判断。"
  ),
  voice_modify: VoiceModifySchema.optional(),
  subtitle_enable: z.boolean().optional().describe(
    "控制是否开启字幕服务，默认值为 false。此参数仅在非流式输出场景下有效，且仅对 `speech-2.6-hd` `speech-2.6-turbo` `speech-02-turbo` `speech-02-hd` `speech-01-turbo` `speech-01-hd` 模型有效"
  ),
  output_format: OutputFormatEnum.optional().hidden().describe(
    "控制输出结果形式的参数，可选值范围为[`url`, `hex`]，默认值为 `hex` 。该参数仅在非流式场景生效，流式场景仅支持返回 hex 形式。返回的 url 有效期为 24 小时"
  ),
  aigc_watermark: z.boolean().optional().describe(
    "控制在合成音频的末尾添加音频节奏标识，默认值为 False。该参数仅对非流式合成生效"
  ),
});

export type T2aV2Request = z.infer<typeof T2aV2RequestSchema>;
