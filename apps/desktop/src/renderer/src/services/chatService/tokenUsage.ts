import { encodingForModel, getEncoding, getEncodingNameForModel } from 'js-tiktoken'

const DEFAULT_ENCODING = 'cl100k_base'
const encodingCache = new Map<string, ReturnType<typeof getEncoding>>()

const toFiniteNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const getUsageValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    return toFiniteNumber((value as { total?: unknown }).total)
  }
  return undefined
}

const getEncodingForModel = (model?: string) => {
  const normalizedModel = model?.trim()
  const cacheKey = normalizedModel || DEFAULT_ENCODING

  const cached = encodingCache.get(cacheKey)
  if (cached) return cached

  let encoding: ReturnType<typeof getEncoding>

  try {
    if (normalizedModel) {
      const encodingName = getEncodingNameForModel(normalizedModel as any)
      encoding = getEncoding(encodingName)
    } else {
      encoding = getEncoding(DEFAULT_ENCODING)
    }
  } catch {
    try {
      encoding = normalizedModel ? encodingForModel(normalizedModel as any) : getEncoding(DEFAULT_ENCODING)
    } catch {
      encoding = getEncoding(DEFAULT_ENCODING)
    }
  }

  encodingCache.set(cacheKey, encoding)
  return encoding
}

export const serializeValueForTokenEstimation = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const serializeMessageForTokenEstimation = (
  message: BaseMessage,
  options: { includeRole?: boolean } = {}
): string => {
  const includeRole = options.includeRole !== false
  const serializedParts = message.parts
    ?.map((part) => {
      if (part.type === 'text') {
        return part.text?.trim() || ''
      }

      if (part.type.startsWith('tool')) {
        const toolPart = part as any
        const toolName = toolPart.toolName || part.type.replace(/^tool-/, '')
        const input = serializeValueForTokenEstimation(toolPart.input)
        const output = serializeValueForTokenEstimation(toolPart.output)

        return [
          `[工具:${toolName}]`,
          input ? `输入: ${input}` : '',
          output ? `输出: ${output}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      }

      if (part.type === 'file') {
        const filePart = part as any
        const fileName = filePart.filename || filePart.url || '未命名文件'
        const mediaType = filePart.mediaType || 'unknown'
        return `[文件] ${fileName} (${mediaType})`
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')

  if (!serializedParts) return ''
  return includeRole ? `${message.role}: ${serializedParts}` : serializedParts
}

export const estimateTextTokens = (text: string, model?: string): number => {
  if (!text.trim()) return 0

  try {
    return getEncodingForModel(model).encode(text).length
  } catch {
    return Math.ceil(text.length / 4)
  }
}

export const estimateMessageTokens = (message: BaseMessage, model?: string): number => {
  const serialized = serializeMessageForTokenEstimation(message)
  if (!serialized) return 0
  return estimateTextTokens(serialized, model) + 4
}

export const estimateMessagesTokens = (messages: BaseMessage[], model?: string): number => {
  return messages.reduce((total, message) => total + estimateMessageTokens(message, model), 0)
}

export const getFlatTokenUsage = (
  usage: unknown
): { inputTokens?: number; outputTokens?: number; totalTokens?: number } => {
  const rawUsage = (usage ?? {}) as Record<string, any>

  const inputTokens =
    getUsageValue(rawUsage.inputTokens) ??
    toFiniteNumber(rawUsage.prompt_tokens) ??
    toFiniteNumber(rawUsage.promptTokens) ??
    toFiniteNumber(rawUsage.input_tokens)

  const outputTokens =
    getUsageValue(rawUsage.outputTokens) ??
    toFiniteNumber(rawUsage.completion_tokens) ??
    toFiniteNumber(rawUsage.completionTokens) ??
    toFiniteNumber(rawUsage.output_tokens)

  const totalTokens =
    toFiniteNumber(rawUsage.totalTokens) ??
    toFiniteNumber(rawUsage.total_tokens) ??
    (inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined)

  return {
    inputTokens,
    outputTokens,
    totalTokens
  }
}

export const buildFlatTokenUsage = (options: {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimated?: boolean
}) => {
  const { inputTokens, outputTokens, totalTokens, estimated } = options

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    ...(estimated ? { estimated: true } : {})
  }
}
