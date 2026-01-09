import { z } from "zod";

/* =========================
 * 枚举
 * ========================= */

/**
 * 请求使用的语音合成模型版本
 */
export const ModelEnum = z.enum([
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
]).describe("请求的模型版本");

/**
 * 合成语音情绪类型
 */
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
]).describe("控制合成语音的情绪类型");

/**
 * 输出音频格式
 */
export const AudioFormatEnum = z.enum([
  "mp3",
  "pcm",
  "flac",
  "wav",
]).describe("生成音频的文件格式");

/**
 * 非流式输出结果返回形式
 */
export const OutputFormatEnum = z.enum([
  "url",
  "hex",
]).describe("非流式场景下的音频返回形式");

/**
 * 小语种 / 方言增强配置
 */
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
]).describe("是否增强指定语言或方言的识别能力");

/**
 * 声音效果器类型
 */
export const SoundEffectsEnum = z.enum([
  "spacious_echo",
  "auditorium_echo",
  "lofi_telephone",
  "robotic",
]).describe("音效处理器类型");

/* =========================
 * 子结构
 * ========================= */

/**
 * 流式输出相关配置
 */
export const T2AStreamOptionSchema = z.object({
  exclude_aggregated_audio: z
    .boolean()
    .optional()
    .describe("是否在最后一个流式 chunk 中排除完整拼接后的音频"),
}).describe("流式输出配置");

/**
 * 语音合成音色与朗读设置
 */
export const T2AVoiceSettingSchema = z.object({
  voice_id: z
    .string()
    .describe("合成语音的音色 ID；若使用混合音色请将此字段置空"),
  speed: z
    .number()
    .min(0.5)
    .max(2)
    .default(1)
    .optional()
    .describe("语速控制，数值越大语速越快，范围 [0.5, 2]"),
  vol: z
    .number()
    .gt(0)
    .max(10)
    .default(1)
    .optional()
    .describe("音量大小，范围 (0, 10]"),
  pitch: z
    .number()
    .int()
    .min(-12)
    .max(12)
    .default(0)
    .optional()
    .describe("语调调整，0 为原始音色"),
  emotion: EmotionEnum
    .optional()
    .describe("合成语音的情绪类型，通常可由模型自动判断"),
  text_normalization: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否启用中英文文本规范化"),
  latex_read: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否朗读 LaTeX 数学公式（需使用 $$ 包裹）"),
}).describe("语音合成音色与朗读参数");

/**
 * 音频编码相关设置
 */
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
    .describe("音频采样率"),
  bitrate: z
    .union([
      z.literal(32000),
      z.literal(64000),
      z.literal(128000),
      z.literal(256000),
    ])
    .optional()
    .describe("音频比特率，仅对 mp3 格式生效"),
  format: AudioFormatEnum
    .default("mp3")
    .optional()
    .describe("生成音频的格式"),
  channel: z
    .union([z.literal(1), z.literal(2)])
    .default(1)
    .optional()
    .describe("音频声道数：1 单声道，2 双声道"),
  force_cbr: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否强制使用恒定比特率编码（仅流式 mp3 生效）"),
}).describe("音频编码配置");

/**
 * 自定义发音字典
 */
export const PronunciationDictSchema = z.object({
  tone: z
    .array(z.string())
    .optional()
    .describe("自定义文字或词语的发音与注音规则"),
}).describe("自定义发音配置");

/**
 * 混合音色权重设置
 */
export const TimbreWeightsSchema = z.object({
  voice_id: z
    .string()
    .describe("参与混合的音色 ID"),
  weight: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe("该音色在混合中的权重占比"),
}).describe("音色混合权重配置");

/**
 * 声音效果器参数
 */
export const VoiceModifySchema = z.object({
  pitch: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .optional()
    .describe("音高调整，负值更低沉，正值更明亮"),
  intensity: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .optional()
    .describe("强度调整，负值更有力量，正值更柔和"),
  timbre: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .optional()
    .describe("音色调整，负值更浑厚，正值更清脆"),
  sound_effects: SoundEffectsEnum
    .optional()
    .describe("预设音效类型"),
}).describe("声音效果器配置");

/* =========================
 * 请求体
 * ========================= */

export const T2aV2RequestSchema = z.object({
  model: ModelEnum.describe("使用的语音合成模型"),
  text: z
    .string()
    .max(10000)
    .describe("需要合成语音的文本内容，最大 10000 字符"),
  stream: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否启用流式输出"),

  stream_options: T2AStreamOptionSchema.optional(),
  voice_setting: T2AVoiceSettingSchema.optional(),
  audio_setting: T2AAudioSettingSchema.optional(),
  pronunciation_dict: PronunciationDictSchema.optional(),
  timbre_weights: z
    .array(TimbreWeightsSchema)
    .max(4)
    .optional()
    .describe("最多支持 4 种音色混合"),

  language_boost: LanguageBoostEnum
    .nullable()
    .optional()
    .describe("语言或方言增强策略"),
  voice_modify: VoiceModifySchema.optional(),

  subtitle_enable: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否生成字幕（仅非流式且部分模型支持）"),
  output_format: OutputFormatEnum
    .default("hex")
    .optional()
    .describe("非流式输出时音频返回形式"),
  aigc_watermark: z
    .boolean()
    .default(false)
    .optional()
    .describe("是否在音频末尾添加 AIGC 节奏水印"),
});

/**
 * 请求参数类型
 */
export type T2aV2Request = z.infer<typeof T2aV2RequestSchema>;
