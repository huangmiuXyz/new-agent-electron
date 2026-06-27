import { encodingForModel, getEncoding, getEncodingNameForModel } from 'js-tiktoken'

const DEFAULT_ENCODING = 'cl100k_base'
const encodingCache = new Map<string, ReturnType<typeof getEncoding>>()
const MAX_SERIALIZED_VALUE_LENGTH = 4000

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
  const truncate = (text: string) => {
    if (text.length <= MAX_SERIALIZED_VALUE_LENGTH) return text
    return `${text.slice(0, MAX_SERIALIZED_VALUE_LENGTH)}...[truncated ${text.length - MAX_SERIALIZED_VALUE_LENGTH} chars]`
  }

  if (typeof value === 'string') return truncate(value)
  if (value == null) return ''
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return truncate(String(value))
  }
}

export const serializeMessageForTokenEstimation = (
  message: BaseMessage,
  options: { includeRole?: boolean } = {}
): string => {
  const includeRole = options.includeRole !== false
  const serializedParts = message.parts
    ?.map((part) => serializeMessagePartForTokenEstimation(part))
    .filter(Boolean)
    .join('\n')

  if (!serializedParts) return ''
  return includeRole ? `${message.role}: ${serializedParts}` : serializedParts
}

export const serializeMessagePartForTokenEstimation = (
  part: BaseMessage['parts'][number]
): string => {
  if (part.type === 'text' || part.type === 'reasoning') {
    return (part.text as string | undefined)?.trim() || ''
  }

  if (part.type === 'dynamic-tool' || part.type.startsWith('tool')) {
    const toolPart = part as any
    const toolName = toolPart.toolName || toolPart.title || part.type.replace(/^tool-/, '')
    const input = serializeValueForTokenEstimation(toolPart.input)
    const output = serializeValueForTokenEstimation(toolPart.output)
    const errorText = serializeValueForTokenEstimation(toolPart.errorText)

    return [
      `[工具:${toolName}]`,
      toolPart.state ? `状态: ${toolPart.state}` : '',
      input ? `输入: ${input}` : '',
      output ? `输出: ${output}` : '',
      errorText ? `错误: ${errorText}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (part.type === 'file' || part.type === 'reasoning-file') {
    const filePart = part as any
    const fileName = filePart.filename || filePart.url || '未命名文件'
    const mediaType = filePart.mediaType || 'unknown'
    return `[文件] ${fileName} (${mediaType})`
  }

  if (part.type === 'source-url') {
    const sourcePart = part as any
    return `[来源] ${sourcePart.title || sourcePart.url || sourcePart.sourceId || ''}`.trim()
  }

  if (part.type === 'source-document') {
    const sourcePart = part as any
    return `[来源] ${sourcePart.title || sourcePart.filename || sourcePart.sourceId || ''}`.trim()
  }

  if (part.type.startsWith('data-')) {
    const dataPart = part as any
    const data = serializeValueForTokenEstimation(dataPart.data)
    return data ? `[数据:${part.type.replace(/^data-/, '')}] ${data}` : ''
  }

  return ''
}

const serializeGeneratedPartForTokenEstimation = (part: BaseMessage['parts'][number]): string => {
  if (part.type === 'text' || part.type === 'reasoning') return part.text?.trim() || ''

  if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
    const toolPart = part as any
    const toolName = toolPart.toolName || toolPart.title || part.type.replace(/^tool-/, '')
    const input = serializeValueForTokenEstimation(toolPart.input)

    return [
      `[工具:${toolName}]`,
      toolPart.state ? `状态: ${toolPart.state}` : '',
      input ? `输入: ${input}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

export const extractGeneratedTextForTokenEstimation = (message: BaseMessage): string => {
  return (
    message.parts
      ?.map((part) => serializeGeneratedPartForTokenEstimation(part))
      .filter(Boolean)
      .join('\n') || ''
  )
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

export const serializeV4PromptForTokenEstimation = (prompt: unknown[]): string => {
  return prompt
    .map((msg) => {
      const message = msg as { role: string; content: unknown }
      let content = ''

      if (typeof message.content === 'string') {
        content = message.content
      } else if (Array.isArray(message.content)) {
        content = message.content
          .map((part: Record<string, unknown>) => {
            if (part.type === 'text' || part.type === 'reasoning') {
              return (part.text as string) || ''
            }
            if (part.type === 'file' || part.type === 'reasoning-file') {
              const fileName = (part.filename as string) || (part as Record<string, unknown>).url as string || ''
              return `[文件]${fileName ? ` ${fileName}` : ''}`
            }
            if (part.type === 'tool-call') {
              const input = serializeValueForTokenEstimation(part.input)
              const name = part.toolName as string || ''
              return `[工具调用:${name}]${input ? ` ${input}` : ''}`
            }
            if (part.type === 'tool-result') {
              const output = serializeValueForTokenEstimation(part.output)
              const name = part.toolName as string || ''
              return `[工具结果:${name}]${output ? ` ${output}` : ''}`
            }
            return ''
          })
          .filter(Boolean)
          .join('\n')
      }

      return content ? `${message.role}: ${content}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

export const serializeV4ToolsForTokenEstimation = (tools: unknown[] | undefined): string => {
  if (!tools || tools.length === 0) return ''
  return tools
    .map((t) => {
      const tool = t as { name: string; description?: string; inputSchema?: Record<string, unknown> }
      const schema = serializeValueForTokenEstimation(tool.inputSchema)
      const desc = tool.description ? ` - ${tool.description}` : ''
      return `[工具定义:${tool.name}]${desc}${schema ? `\n参数: ${schema}` : ''}`
    })
    .filter(Boolean)
    .join('\n\n')
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
