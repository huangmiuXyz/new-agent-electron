import type { LanguageModelV4CallOptions, LanguageModelV4Prompt, LanguageModelV4Message } from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'
import { isTextFile } from '@renderer/utils'

const decodeBase64ToText = (payload: string): string => {
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new TextDecoder('utf-8').decode(bytes)
}

const decodeTextDataUrl = (dataUrl: string): string | null => {
  try {
    const base64Match = dataUrl.match(/^data:[^;,]+;base64,(.+)$/)
    if (base64Match?.[1]) return decodeBase64ToText(base64Match[1])

    const commaIndex = dataUrl.indexOf(',')
    if (commaIndex < 0) return null
    return decodeURIComponent(dataUrl.slice(commaIndex + 1))
  } catch (error) {
    console.warn('Failed to decode text file data URL:', error)
    return null
  }
}

const readTextFileUrl = (url: string): string | null => {
  if (!url.startsWith('file://')) return null

  try {
    return window.api.fs.readFileSync(window.api.url.fileURLToPath(url), 'utf-8')
  } catch (error) {
    console.warn('Failed to read local text file:', error)
    return null
  }
}

const decodeFileDataAsText = (data: unknown): string | null => {
  if (typeof data === 'string') {
    if (data.startsWith('data:')) return decodeTextDataUrl(data)
    if (data.startsWith('file://')) return readTextFileUrl(data)

    try {
      return decodeBase64ToText(data)
    } catch {
      return data
    }
  }

  if (data instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(data)
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(new Uint8Array(data))
  }

  return null
}

const getFilePartName = (part: any): string => {
  if (typeof part.filename === 'string' && part.filename) return part.filename
  if (typeof part.name === 'string' && part.name) return part.name
  return ''
}

const isTextFilePart = (part: any): boolean => {
  const mediaType = typeof part.mediaType === 'string' ? part.mediaType.toLowerCase() : ''
  const filename = getFilePartName(part)

  return mediaType.startsWith('text/') || (filename ? isTextFile(filename) : false)
}

const convertTextFilePart = (part: any) => {
  if (part?.type !== 'file' || !isTextFilePart(part)) return part

  const text = decodeFileDataAsText(part.data)
  if (text == null) return part

  const filename = getFilePartName(part) || '未命名文本文件'

  return {
    type: 'text',
    text: [`[文件: ${filename}]`, text].join('\n')
  }
}

export const createTextFileMiddleware = (): LanguageModelMiddleware => {
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const _t1 = createTimeLog('文本文件中间件')
      const prompt = params.prompt

      const mappedPrompt: LanguageModelV4Prompt = prompt.map((message) => {
        if (!Array.isArray(message.content)) return message as LanguageModelV4Message

        return {
          ...message,
          content: message.content.map(convertTextFilePart)
        } as LanguageModelV4Message
      }) as LanguageModelV4Prompt

      const result: LanguageModelV4CallOptions = {
        ...params,
        prompt: mappedPrompt
      }
      syncTimeLog(_t1, '文本文件中间件')
      return result
    }
  }
}
