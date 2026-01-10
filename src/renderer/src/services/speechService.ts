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
      modelId = settingsStore.defaultModels.speechModelId,
      providerId = settingsStore.defaultModels.speechProviderId,
      voice,
      speed,
      language,
      providerOptions
    } = params

    const chunkId = nanoid()
    // Create placeholder immediately to preserve order in the queue
    const placeholder = speechStore.createPlaceholder(chunkId, messageId, text)

    if (!modelId || !providerId) {
      console.warn('Speech model or provider not configured')
      return
    }

    const provider = settingsStore.getProviderById(providerId)
    if (!provider) {
      console.warn(`Provider ${providerId} not found`)
      return
    }

    try {
      const registry = createRegistry({
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl,
        name: provider.name
      })

      const modelString = `${provider.providerType}:${modelId}`

      const { audio } = await generateSpeech({
        model: registry.speechModel(modelString as any),
        text,
        voice,
        speed,
        language,
        providerOptions: {
          [provider.providerType]: providerOptions || {}
        }
      })

      const base64 = audio.base64

      const duration = await speechStore.fulfillChunk(chunkId, base64)
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
