import { z } from "zod";

/**
 * references 子项
 */
const siliconFlowSpeechReferenceSchema = z.object({
  /**
   * 指向音频文件的 URL
   */
  audio: z
    .string()
    .url()
    .describe(
      "指向音频文件的 URL（例如：https://example.com/audio.mp3）。"
    ),

  /**
   * 音频内容，可以是音频文件的 URL，也可以是 Base64 编码的音频字符串。
   */
  text: z
    .string()
    .describe(
      "音频内容，可以是音频文件的 URL，也可以是 Base64 编码的音频字符串。"
    ),
});

/**
 * 主请求 Schema
 */
export const siliconFlowCreateSpeechRequestSchema = z
  .object({
    /**
     * 模型名称
     */
    model: z
      .enum([
        "fnlp/MOSS-TTSD-v0.5",
        "CosyVoice2-0.5B",
      ])
      .describe(
        "MOSS-TTSD（文本转语音对话）是一个开源的双语语音对话合成模型，支持中文和英文。"
      ),

    /**
     * 输入的对话文本
     */
    input: z
      .string()
      .min(1)
      .max(128000)
      .describe(
        "对话文本使用说话人标签来指示轮次：[S1] 和 [S2]。"
      ),

    /**
     * 最大 Token 数
     */
    max_tokens: z
      .number()
      .int()
      .optional()
      .default(2048)
      .describe(
        "要生成的最大 Token 数量。输入 + 输出不超过 32k 个 Token。"
      ),

    /**
     * 语音参考
     * 与 voice 字段互斥
     */
    references: z
      .array(siliconFlowSpeechReferenceSchema)
      .optional()
      .describe(
        "voice 字段和 references 字段是互斥的。剧本对话仅适用于 moss 模型。"
      ),

    /**
     * 音色名称
     */
    voice: z
      .enum([
        "fnlp/MOSS-TTSD-v0.5:alex",
        "fnlp/MOSS-TTSD-v0.5:anna",
        "fnlp/MOSS-TTSD-v0.5:bella",
        "fnlp/MOSS-TTSD-v0.5:benjamin",
        "fnlp/MOSS-TTSD-v0.5:charles",
        "fnlp/MOSS-TTSD-v0.5:claire",
        "fnlp/MOSS-TTSD-v0.5:david",
        "fnlp/MOSS-TTSD-v0.5:diana",
      ])
      .optional()
      .describe(
        '“voice”字段目前不支持两种音色。如果您需要上传两种音色，请使用“reference”。'
      ),

    /**
     * 音频输出格式
     */
    response_format: z
      .enum(["mp3", "opus", "wav", "pcm"])
      .optional()
      .default("mp3")
      .describe(
        "音频输出格式。支持的格式有 mp3、opus、wav、pcm。"
      ),

    /**
     * 采样率
     */
    sample_rate: z
      .number()
      .optional()
      .default(32000)
      .describe(
        "控制输出采样率。不同音频输出类型的默认值和支持范围如下：opus：支持 48000 Hz。wav、pcm：支持 8000、16000、24000、32000、44100 Hz，默认为 44100 Hz。mp3：支持 32000、44100 Hz，默认为 44100 Hz。"
      ),

    /**
     * 流式传输
     */
    stream: z
      .boolean()
      .optional()
      .default(true)
      .describe("是否使用流式传输"),

    /**
     * 语速
     */
    speed: z
      .number()
      .min(0.25)
      .max(4.0)
      .optional()
      .default(1)
      .describe(
        "生成音频的语速。选择 0.25 到 4.0 之间的值，默认为 1.0。"
      ),

    /**
     * 增益
     */
    gain: z
      .number()
      .min(-10)
      .max(10)
      .optional()
      .default(0)
      .describe("音频增益（单位：dB）。"),
  })
  .superRefine((data, ctx) => {
    /**
     * references 与 voice 互斥
     */
    if (data.references && data.voice) {
      ctx.addIssue({
        path: ["voice"],
        code: z.ZodIssueCode.custom,
        message: "voice 和 references 字段是互斥的",
      });
    }
  });
