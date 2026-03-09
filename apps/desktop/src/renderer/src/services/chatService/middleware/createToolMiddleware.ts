import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FilePart,
  LanguageModelV3Message,
  LanguageModelV3Middleware
} from '@ai-sdk/provider'

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

const createImageFilePart = (part: any): LanguageModelV3FilePart | null => {
  if (part?.type === 'image-data' && typeof part.data === 'string' && isImageMediaType(part.mediaType)) {
    return {
      type: 'file',
      data: part.data,
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  if (part?.type === 'image-url' && typeof part.url === 'string') {
    return {
      type: 'file',
      data: extractDataUrlPayload(part.url),
      mediaType: inferImageMediaTypeFromUrl(part.url)
    }
  }

  if (part?.type === 'file-data' && typeof part.data === 'string' && isImageMediaType(part.mediaType)) {
    return {
      type: 'file',
      data: part.data,
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  if (part?.type === 'file-url' && typeof part.url === 'string') {
    return {
      type: 'file',
      data: extractDataUrlPayload(part.url),
      mediaType: inferImageMediaTypeFromUrl(part.url),
      ...(part.filename ? { filename: part.filename } : {})
    }
  }

  return null
}

const stripImagesFromToolContent = (content: any[] | undefined) => {
  const fileParts: LanguageModelV3FilePart[] = []
  const sanitizedContent: any[] = []

  for (const part of content || []) {
    const imageFilePart = createImageFilePart(part)
    if (imageFilePart) {
      fileParts.push(imageFilePart)
      continue
    }

    sanitizedContent.push(part)
  }

  if (fileParts.length > 0 && sanitizedContent.length === 0) {
    sanitizedContent.push({
      type: 'text',
      text: `工具返回了 ${fileParts.length} 张图片`
    })
  }

  return { fileParts, sanitizedContent }
}

const normalizeToolResultOutput = (output: any) => {
  if (output?.type === 'content' && Array.isArray(output.value)) {
    const { fileParts, sanitizedContent } = stripImagesFromToolContent(output.value)
    return {
      fileParts,
      output: {
        ...output,
        value: sanitizedContent
      }
    }
  }

  if (output?.type === 'json' && output?.value && typeof output.value === 'object') {
    const value = {
      ...output.value,
      metadata: undefined
    } as Record<string, any>

    const toolResult = value.toolResult
    if (toolResult && Array.isArray(toolResult.content)) {
      const { fileParts, sanitizedContent } = stripImagesFromToolContent(toolResult.content)
      return {
        fileParts,
        output: {
          ...output,
          value: {
            ...value,
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
        value
      }
    }
  }

  return { fileParts: [], output }
}

export const createToolMiddleware = (): LanguageModelV3Middleware => {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const newPrompt: LanguageModelV3Message[] = []

      for (const message of params.prompt as LanguageModelV3Message[]) {
        if (message.role === 'tool') {
          const imageFileParts: LanguageModelV3FilePart[] = []
          const toolMessage = {
            ...message,
            content: message.content.map((part) => {
              if (part.type === 'tool-result') {
                const { fileParts, output } = normalizeToolResultOutput(part.output)
                imageFileParts.push(...fileParts)
                return {
                  ...part,
                  output
                }
              }
              return part
            })
          }

          if (imageFileParts.length === 0) {
            newPrompt.push(toolMessage as LanguageModelV3Message)
            continue
          }

          newPrompt.push(toolMessage as LanguageModelV3Message)
          newPrompt.push({
            role: 'user',
            content: imageFileParts
          } as LanguageModelV3Message)
          continue
        }

        newPrompt.push(message)
      }

      return {
        ...params,
        prompt: newPrompt
      } as LanguageModelV3CallOptions
    }
  }
}
