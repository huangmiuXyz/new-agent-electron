import { experimental_generateSpeech as generateSpeech } from 'ai'
import { createRegistry } from './chatService/registry'
import { useSettingsStore } from '../stores/settings'
import { useSpeechStore, type AudioChunk } from '../stores/speech'
import { useAgentStore } from '../stores/agent'
import { nanoid } from 'nanoid'
import { base64ToUint8Array, parseBase64DataUrl, uint8ArrayToBase64 } from '@renderer/utils'

type TtsAudioInput = string | Uint8Array | ArrayBuffer | Blob

type TtsHookResult = {
  handled?: boolean
  audioData?: string
  audio?: TtsAudioInput
  mediaType?: string
  audioMediaType?: string
  audioFormat?: string
  format?: string
}

type TtsAudioMetadata = {
  mediaType?: string
  audioMediaType?: string
  audioFormat?: string
  format?: string
}

type ResolvedTtsConfig = {
  modelId: string
  providerId: string
  provider: NonNullable<ReturnType<ReturnType<typeof useSettingsStore>['getProviderById']>>
  modelInfo?: any
}

type TtsBaseParams = {
  messageId: string
  chunkId?: string
  modelId?: string
  providerId?: string
  voice?: string
  speed?: number
  language?: string
  providerOptions?: Record<string, any>
  agentId?: string
}

export type TtsTextStreamSession = {
  chunkId: string
  handled: true
  appendText: (text: string) => Promise<void>
  appendTargetText: (targetText: string) => Promise<void>
  finish: () => Promise<AudioChunk | undefined>
  error: (error: unknown) => Promise<void>
  getText: () => string
  getChunk: () => AudioChunk | undefined
}

const activeTextStreamSessions = new Map<string, TtsTextStreamSession>()
const activeTextStreamPromises = new Map<string, Promise<TtsTextStreamSession | null>>()

const isHandledTtsHookResult = (result: unknown): result is TtsHookResult => {
  return Boolean(
    result &&
    typeof result === 'object' &&
    (result as TtsHookResult).handled === true
  )
}

const normalizeBase64Audio = (value: string) => {
  const dataUrl = parseBase64DataUrl(value)
  if (dataUrl) {
    return {
      audioData: dataUrl.base64,
      audioMediaType: dataUrl.mediaType
    }
  }
  return { audioData: value }
}

const normalizeAudioBytes = async (input: TtsAudioInput): Promise<Uint8Array> => {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer())

  return base64ToUint8Array(normalizeBase64Audio(input).audioData)
}

export const speechService = () => {
  const settingsStore = useSettingsStore()
  const speechStore = useSpeechStore()
  const agentStore = useAgentStore()

  const resolveTtsConfig = (params: TtsBaseParams): ResolvedTtsConfig | null => {
    let modelId = params.modelId
    let providerId = params.providerId

    if (params.agentId) {
      const agent = agentStore.getAgentById(params.agentId)
      if (agent?.speechModel?.modelId && agent?.speechModel?.providerId) {
        modelId = agent.speechModel.modelId
        providerId = agent.speechModel.providerId
      }
    }

    if (!modelId || !providerId) return null

    const provider = settingsStore.getProviderById(providerId)
    if (!provider) return null

    return {
      modelId,
      providerId,
      provider,
      modelInfo: provider.models?.find((item) => item.id === modelId)
    }
  }

  const createHookController = (chunkId: string, options?: {
    ensureChunk?: () => void
    appendText?: (text: string) => void
    setText?: (text: string) => void
  }) => {
    let settled = false
    let settleHook: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      settleHook = () => {
        settled = true
        resolve()
      }
    })

    const normalizeMetadata = (metadata?: TtsAudioMetadata) => ({
      audioMediaType: metadata?.audioMediaType || metadata?.mediaType,
      audioFormat: metadata?.audioFormat || metadata?.format
    })

    const ensureChunk = () => {
      options?.ensureChunk?.()
    }

    const controller = {
      chunkId,
      get settled() {
        return settled
      },
      start: (metadata?: TtsAudioMetadata) => {
        ensureChunk()
        speechStore.startStreamChunk(chunkId, normalizeMetadata(metadata))
      },
      appendText: (text: string) => {
        ensureChunk()
        options?.appendText?.(text)
      },
      setText: (text: string) => {
        ensureChunk()
        if (options?.setText) {
          options.setText(text)
        } else {
          speechStore.updateChunkText(chunkId, text)
        }
      },
      append: async (data: TtsAudioInput, metadata?: TtsAudioMetadata) => {
        ensureChunk()
        const bytes = await normalizeAudioBytes(data)
        speechStore.appendStreamChunk(chunkId, bytes, normalizeMetadata(metadata))
      },
      appendAudio: async (data: TtsAudioInput, metadata?: TtsAudioMetadata) => {
        ensureChunk()
        const bytes = await normalizeAudioBytes(data)
        speechStore.appendStreamChunk(chunkId, bytes, normalizeMetadata(metadata))
      },
      fulfill: async (data: TtsAudioInput, metadata?: TtsAudioMetadata) => {
        ensureChunk()
        const audioData = typeof data === 'string'
          ? normalizeBase64Audio(data).audioData
          : uint8ArrayToBase64(await normalizeAudioBytes(data))
        const normalized = typeof data === 'string' ? normalizeBase64Audio(data) : undefined
        const duration = await speechStore.fulfillChunk(chunkId, audioData, {
          audioMediaType: metadata?.audioMediaType || metadata?.mediaType || normalized?.audioMediaType,
          audioFormat: metadata?.audioFormat || metadata?.format
        })
        settleHook()
        return duration
      },
      finish: async (metadata?: TtsAudioMetadata) => {
        ensureChunk()
        const duration = await speechStore.finishStreamChunk(chunkId, normalizeMetadata(metadata))
        settleHook()
        return duration
      },
      error: (error: unknown) => {
        ensureChunk()
        const message = error instanceof Error ? error.message : String(error)
        speechStore.markChunkError(chunkId, message)
        settleHook()
      },
      done
    }

    return controller
  }

  const generateAndPlay = async (params: {
    text: string
    messageId: string
    chunkId?: string
    modelId?: string
    providerId?: string
    voice?: string
    speed?: number
    language?: string
    providerOptions?: Record<string, any>
    agentId?: string
  }) => {
    const {
      text,
      messageId,
      voice,
      speed,
      language,
      providerOptions
    } = params

    const chunkId = params.chunkId || nanoid()
    const resolved = resolveTtsConfig(params)
    if (!resolved) {
      const placeholder = speechStore.createPlaceholder(chunkId, messageId, text, {
        kind: 'speech'
      })
      speechStore.markChunkError(chunkId, 'Speech model or provider not configured')
      console.warn('Speech model or provider not configured')
      return placeholder
    }

    const { modelId, providerId, provider, modelInfo } = resolved
    const placeholder = speechStore.createPlaceholder(chunkId, messageId, text, {
      providerId,
      providerName: provider.name,
      modelId,
      modelName: modelInfo?.name || modelId,
      kind: modelId.startsWith('music-') ? 'music' : 'speech'
    })

    try {
      const modelString = `${provider.providerType}:${modelId}`

      const cleanObject = (obj: any): any => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([_, v]) => {
              if (v === '' || v === null || v === undefined) return false
              if (Array.isArray(v) && v.length === 0) return false
              return true
            })
            .map(([k, v]) => [k, cleanObject(v)])
        )
      }
      const { triggerHook } = usePlugins()
      const hookController = createHookController(chunkId)

      const hookResults = await triggerHook('ai:before-tts-use', {
        ...params,
        modelId,
        providerId,
        provider,
        modelInfo,
        chunkId,
        controller: hookController
      })
      const handledHookResult = hookResults.find(isHandledTtsHookResult)
      if (handledHookResult) {
        const mediaType = handledHookResult.audioMediaType || handledHookResult.mediaType
        const audioFormat = handledHookResult.audioFormat || handledHookResult.format

        if (handledHookResult.audioData) {
          await hookController.fulfill(handledHookResult.audioData, {
            mediaType,
            audioFormat
          })
        } else if (handledHookResult.audio) {
          await hookController.fulfill(handledHookResult.audio, {
            mediaType,
            audioFormat
          })
        } else if (!hookController.settled) {
          await hookController.done
        }

        const completedChunk = speechStore.queue.find((chunk) => chunk.id === chunkId)
        if (completedChunk?.error) {
          throw new Error(completedChunk.error)
        }
        return {
          ...placeholder,
          ...completedChunk,
          loading: false
        }
      }

      const { audio } = await generateSpeech({
        model: createRegistry({
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl,
          name: provider.name
        }).speechModel(modelString as any),
        text,
        voice,
        speed,
        language,
        providerOptions: {
          [provider.providerType]: cleanObject(providerOptions || {})
        }
      })

      const base64 = audio.base64

      const duration = await speechStore.fulfillChunk(chunkId, base64, {
        audioMediaType: audio.mediaType || 'audio/mpeg',
        audioFormat: audio.format
      })
      return { ...placeholder, audioData: base64, loading: false, duration }
    } catch (error) {
      console.error('Speech generation failed:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      speechStore.markChunkError(chunkId, errorMessage)
      throw error
    }
  }

  const createTextStream = async (params: TtsBaseParams): Promise<TtsTextStreamSession | null> => {
    const streamKey = params.messageId
    const activeSession = activeTextStreamSessions.get(streamKey)
    if (activeSession) return activeSession

    const activePromise = activeTextStreamPromises.get(streamKey)
    if (activePromise) return activePromise

    const resolved = resolveTtsConfig(params)
    if (!resolved) return null

    const sessionPromise = (async () => {
      const { modelId, providerId, provider, modelInfo } = resolved
      const chunkId = params.chunkId || nanoid()
      const { triggerHook } = usePlugins()
      let created = false
      let text = ''
      let finished = false
      let textUpdateQueue = Promise.resolve()

      const cleanup = () => {
        activeTextStreamSessions.delete(streamKey)
        activeTextStreamPromises.delete(streamKey)
      }

      const ensureChunk = () => {
        if (created) return
        speechStore.createPlaceholder(chunkId, params.messageId, text, {
          providerId,
          providerName: provider.name,
          modelId,
          modelName: modelInfo?.name || modelId,
          kind: modelId.startsWith('music-') ? 'music' : 'speech'
        })
        created = true
      }

      const controller = createHookController(chunkId, {
        ensureChunk,
        appendText: (delta) => {
          text += delta
          speechStore.updateChunkText(chunkId, text)
        },
        setText: (nextText) => {
          text = nextText
          speechStore.updateChunkText(chunkId, text)
        }
      })

      const hookPayload = {
        ...params,
        modelId,
        providerId,
        provider,
        modelInfo,
        chunkId,
        text,
        controller
      }

      const startResults = await triggerHook('ai:tts-stream-start', hookPayload)
      if (!startResults.some(isHandledTtsHookResult)) {
        if (created) {
          speechStore.removeChunk(chunkId)
        }
        cleanup()
        return null
      }

      ensureChunk()

      const session: TtsTextStreamSession = {
        chunkId,
        handled: true,
        appendText: async (delta: string) => {
          textUpdateQueue = textUpdateQueue.then(async () => {
            if (!delta || finished) return
            text += delta
            speechStore.updateChunkText(chunkId, text)
            await triggerHook('ai:tts-stream-text', {
              ...hookPayload,
              text,
              delta,
              controller
            })
          })
          await textUpdateQueue
        },
        appendTargetText: async (targetText: string) => {
          textUpdateQueue = textUpdateQueue.then(async () => {
            if (!targetText || finished || targetText.length <= text.length) return
            const delta = targetText.startsWith(text)
              ? targetText.slice(text.length)
              : targetText
            if (!delta) return
            text += delta
            speechStore.updateChunkText(chunkId, text)
            await triggerHook('ai:tts-stream-text', {
              ...hookPayload,
              text,
              delta,
              controller
            })
          })
          await textUpdateQueue
        },
        finish: async () => {
          if (finished) {
            return speechStore.queue.find((item) => item.id === chunkId)
          }
          finished = true
          await textUpdateQueue
          await triggerHook('ai:tts-stream-finish', {
            ...hookPayload,
            text,
            controller
          })
          if (!controller.settled) {
            await controller.finish()
          }
          const chunk = speechStore.queue.find((item) => item.id === chunkId)
          cleanup()
          if (chunk?.error) {
            throw new Error(chunk.error)
          }
          return chunk
        },
        error: async (error: unknown) => {
          if (finished) return
          finished = true
          controller.error(error)
          cleanup()
          await triggerHook('ai:tts-stream-error', {
            ...hookPayload,
            text,
            error,
            controller
          })
        },
        getText: () => text,
        getChunk: () => speechStore.queue.find((item) => item.id === chunkId)
      }

      activeTextStreamSessions.set(streamKey, session)
      activeTextStreamPromises.delete(streamKey)
      return session
    })().catch((error) => {
      activeTextStreamPromises.delete(streamKey)
      throw error
    })

    activeTextStreamPromises.set(streamKey, sessionPromise)
    return sessionPromise
  }

  return {
    generateAndPlay,
    createTextStream
  }
}
