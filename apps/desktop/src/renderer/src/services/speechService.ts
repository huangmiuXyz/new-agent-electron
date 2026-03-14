import { experimental_generateSpeech as generateSpeech } from 'ai'
import { createRegistry } from './chatService/registry'
import { useSettingsStore } from '../stores/settings'
import { useSpeechStore } from '../stores/speech'
import { nanoid } from 'nanoid'

export const speechService = () => {
  const settingsStore = useSettingsStore()
  const speechStore = useSpeechStore()

  const generateAndPlay = async (params: {
    text: string
    messageId: string
    modelId?: string
    providerId?: string
    voice?: string
    speed?: number
    language?: string
    providerOptions?: Record<string, any>
  }) => {
    const {
      text,
      messageId,
      modelId = settingsStore.defaultModels.ttsModelId,
      providerId = settingsStore.defaultModels.ttsProviderId,
      voice,
      speed,
      language,
      providerOptions
    } = params

    if (!modelId || !providerId) {
      console.warn('Speech model or provider not configured')
      return
    }

    const provider = settingsStore.getProviderById(providerId)
    if (!provider) {
      console.warn(`Provider ${providerId} not found`)
      return
    }

    const chunkId = nanoid()
    const modelInfo = provider.models?.find((item) => item.id === modelId)
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
      await triggerHook('ai:before-tts-use', params)
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

  return {
    generateAndPlay
  }
}
