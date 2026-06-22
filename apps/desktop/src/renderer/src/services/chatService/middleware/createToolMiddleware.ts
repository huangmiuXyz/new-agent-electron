import type {
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
  LanguageModelV4ToolResultOutput,
  SharedV4FileDataData,
  JSONValue
} from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'

const isImageMediaType = (mediaType: unknown): mediaType is string => {
  return typeof mediaType === 'string' && mediaType.startsWith('image/')
}

const inferImageMediaTypeFromUrl = (url: string): string => {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)/)
    if (match?.[1]) return match[1]
  }

  const pathname = url.split('?')[0].toLowerCase()
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
  if (pathname.endsWith('.gif')) return 'image/gif'
  if (pathname.endsWith('.webp')) return 'image/webp'
  if (pathname.endsWith('.bmp')) return 'image/bmp'
  if (pathname.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

const extractDataUrlPayload = (url: string): string => {
  if (!url.startsWith('data:')) return url

  const match = url.match(/^data:[^;,]+;base64,(.+)$/)
  return match?.[1] || url
}

const createImageFilePart = (part: any): LanguageModelV4FilePart | null => {
  const sharedData = (data: string): SharedV4FileDataData => ({ type: 'data', data })

  if (part?.type === 'image-data' && typeof part.data === 'string' && isImageMediaType(part.mediaType)) {
    return {
      type: 'file',
      data: sharedData(part.data),
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  if (part?.type === 'image-url' && typeof part.url === 'string') {
    return {
      type: 'file',
      data: sharedData(extractDataUrlPayload(part.url)),
      mediaType: inferImageMediaTypeFromUrl(part.url)
    }
  }

  if (part?.type === 'file-data' && typeof part.data === 'string' && isImageMediaType(part.mediaType)) {
    return {
      type: 'file',
      data: sharedData(part.data),
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  if (part?.type === 'file-url' && typeof part.url === 'string') {
    return {
      type: 'file',
      data: sharedData(extractDataUrlPayload(part.url)),
      mediaType: inferImageMediaTypeFromUrl(part.url),
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  return null
}

const stripImagesFromToolContent = <T>(content: readonly T[]) => {
  const fileParts: LanguageModelV4FilePart[] = []
  const sanitizedContent: T[] = []

  for (const part of content) {
    const imageFilePart = createImageFilePart(part)
    if (imageFilePart) {
      fileParts.push(imageFilePart)
      continue
    }

    sanitizedContent.push(part)
  }

  return { fileParts, sanitizedContent }
}

const normalizeToolResultOutput = (
  output: LanguageModelV4ToolResultOutput
): { fileParts: LanguageModelV4FilePart[]; output: LanguageModelV4ToolResultOutput } => {
  if (output.type === 'content') {
    const { fileParts, sanitizedContent } = stripImagesFromToolContent(output.value)
    if (fileParts.length > 0 && sanitizedContent.length === 0) {
      return {
        fileParts,
        output: {
          ...output,
          value: [{ type: 'text', text: `工具返回了 ${fileParts.length} 张图片` }]
        }
      }
    }
    return {
      fileParts,
      output: {
        ...output,
        value: sanitizedContent
      }
    }
  }

  if (output.type === 'json' && typeof output.value === 'object' && output.value != null && !Array.isArray(output.value)) {
    const value: Record<string, JSONValue | undefined> = output.value
    const toolResult = value.toolResult
    if (toolResult != null && typeof toolResult === 'object' && !Array.isArray(toolResult) && 'content' in toolResult && Array.isArray(toolResult.content)) {
      const { fileParts, sanitizedContent } = stripImagesFromToolContent(toolResult.content)
      return {
        fileParts,
        output: {
          ...output,
          value: {
            ...value,
            metadata: undefined,
            toolResult: {
              ...toolResult,
              content: sanitizedContent
            }
          }
        }
      }
    }

    return {
      fileParts: [],
      output: {
        ...output,
        value: {
          ...value,
          metadata: undefined
        }
      }
    }
  }

  return { fileParts: [], output }
}

export const createToolMiddleware = (): LanguageModelMiddleware => {
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const newPrompt: LanguageModelV4Prompt = []

      for (const message of params.prompt) {
        if (message.role === 'tool') {
          const imageFileParts: LanguageModelV4FilePart[] = []
          const toolMessage = {
            ...message,
            content: message.content.map((part) => {
              if (part.type === 'tool-result') {
                const { fileParts, output } = normalizeToolResultOutput(part.output)
                imageFileParts.push(...fileParts)
                return {
                  ...part,
                  output
                } as LanguageModelV4ToolResultPart
              }
              return part
            })
          }

          newPrompt.push(toolMessage)

          if (imageFileParts.length > 0) {
            newPrompt.push({
              role: 'user',
              content: imageFileParts
            })
          }
          continue
        }

        newPrompt.push(message)
      }

      return {
        ...params,
        prompt: newPrompt
      }
    }
  }
}
