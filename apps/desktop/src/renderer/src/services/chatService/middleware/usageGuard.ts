import type { LanguageModelV4Usage, LanguageModelV4StreamPart } from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'

const toNumberOrUndefined = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const normalizeUsage = (rawUsage: unknown): LanguageModelV4Usage => {
  const usage = (rawUsage ?? {}) as Record<string, any>

  // Already in V4 shape:
  if (usage.inputTokens || usage.outputTokens) {
    return {
      inputTokens: {
        total: toNumberOrUndefined(usage.inputTokens?.total),
        noCache: toNumberOrUndefined(usage.inputTokens?.noCache),
        cacheRead: toNumberOrUndefined(usage.inputTokens?.cacheRead),
        cacheWrite: toNumberOrUndefined(usage.inputTokens?.cacheWrite),
      },
      outputTokens: {
        total: toNumberOrUndefined(usage.outputTokens?.total),
        text: toNumberOrUndefined(usage.outputTokens?.text),
        reasoning: toNumberOrUndefined(usage.outputTokens?.reasoning),
      },
    }
  }

  // OpenAI-compatible shape:
  const promptTokens =
    toNumberOrUndefined(usage.prompt_tokens) ??
    toNumberOrUndefined(usage.promptTokens) ??
    toNumberOrUndefined(usage.input_tokens)

  const completionTokens =
    toNumberOrUndefined(usage.completion_tokens) ??
    toNumberOrUndefined(usage.completionTokens) ??
    toNumberOrUndefined(usage.output_tokens)

  const reasoningTokens =
    toNumberOrUndefined(usage.completion_tokens_details?.reasoning_tokens) ??
    toNumberOrUndefined(usage.reasoning_tokens)

  const cacheReadTokens =
    toNumberOrUndefined(usage.prompt_tokens_details?.cached_tokens) ??
    toNumberOrUndefined(usage.cachedInputTokens)

  return {
    inputTokens: {
      total: promptTokens,
      noCache:
        promptTokens != null
          ? Math.max(0, promptTokens - (cacheReadTokens ?? 0))
          : undefined,
      cacheRead: cacheReadTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text:
        completionTokens != null
          ? Math.max(0, completionTokens - (reasoningTokens ?? 0))
          : undefined,
      reasoning: reasoningTokens,
    },
  }
}

export const createUsageGuardMiddleware = (): LanguageModelMiddleware => {
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate }) => {
      const _t1 = createTimeLog('UsageGuard-wrapGenerate')
      const result = await doGenerate()
      syncTimeLog(_t1, 'UsageGuard-wrapGenerate')
      return {
        ...result,
        usage: normalizeUsage(result.usage),
      }
    },
    wrapStream: async ({ doStream }) => {
      const _t2 = createTimeLog('UsageGuard-wrapStream')
      const result = await doStream()
      syncTimeLog(_t2, 'UsageGuard-wrapStream')
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform(chunk, controller) {
              if (chunk.type === 'finish') {
                controller.enqueue({
                  ...chunk,
                  usage: normalizeUsage((chunk as any).usage),
                })
                return
              }
              controller.enqueue(chunk)
            },
          }),
        ),
      }
    },
  }
}

