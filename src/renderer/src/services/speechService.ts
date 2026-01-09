import { experimental_generateSpeech as generateSpeech } from 'ai'
import { createRegistry } from './chatService/registry'
import { useSettingsStore } from '../stores/settings'
import { useSpeechStore, AudioChunk } from '../stores/speech'
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
  }) => {
    const {
      text,
      messageId,
      modelId = settingsStore.defaultModels.speechModelId,
      providerId = settingsStore.defaultModels.speechProviderId,
      voice,
      speed,
      language
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

    try {
      const registry = createRegistry({
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl,
        name: provider.name
      })

      // We need to determine the provider prefix for the registry
      // Similar to chatService: `${providerType}:${model}`
      const modelString = `${provider.providerType}:${modelId}`

      const { audio } = await generateSpeech({
        model: registry.speechModel(modelString as any),
        text,
        voice,
        speed,
        language,
        // 专属配置
        providerOptions: {
          ...(provider.providerType === 'hume' ? { hume: {} } : {}),
          ...(provider.providerType === 'elevenlabs' ? { elevenlabs: {} } : {})
        }
      })

      const base64 = audio.base64

      const chunk: AudioChunk = {
        id: nanoid(),
        messageId,
        text,
        audioData: base64,
        played: false
      }

      speechStore.addToQueue(chunk)
      return chunk
    } catch (error) {
      console.error('Speech generation failed:', error)
      throw error
    }
  }

  return {
    generateAndPlay
  }
}
