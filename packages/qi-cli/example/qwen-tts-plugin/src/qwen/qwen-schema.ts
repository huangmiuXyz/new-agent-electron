import { z } from "zod";

export const qwenSpeechProviderOptionsSchema = z.object({
  /**
   * 提示词/指令
   */
  instruct: z
    .string()
    .optional()
    .describe("用于引导语音生成的指令或提示词。")
    .meta({ ifShow: false }),

  /**
   * 模型大小
   */
  model_size: z
    .enum(["1.7B", "0.6B"])
    .optional()
    .default("1.7B")
    .describe("使用的 Qwen TTS 模型大小。"),

  /**
   * 语言
   */
  language: z
    .enum(["Auto", "Chinese", "English", "Japanese", "Korean", "German", "French", "Russian", "Portuguese", "Spanish", "Italian"])
    .optional()
    .default("Auto")
    .describe("合成语音的语言。"),
});
