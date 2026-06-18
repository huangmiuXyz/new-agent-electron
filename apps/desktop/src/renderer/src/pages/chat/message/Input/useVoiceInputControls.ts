import { ref, watch, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'
import { usePlugins } from '@renderer/composables/usePlugins'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSpeechStore } from '@renderer/stores/speech'

export const useVoiceInputControls = (options: {
  message: Ref<string>
  chatProviderId: ComputedRef<string>
  currentChatAgent: ComputedRef<Agent | null | undefined>
  onRecognizedText: () => void
}) => {
  const { triggerHook } = usePlugins()
  const settingsStore = useSettingsStore()
  const { speechEnabled, defaultModels } = storeToRefs(settingsStore)
  const { updateSpeechEnabled } = settingsStore
  const speechStore = useSpeechStore()

  const isRecording = ref(false)
  const isListening = ref(false)
  const isProcessingVoice = ref(false)
  const partialSpeechText = ref('')

  const {
    start: startVoice,
    stop: stopVoice,
    state: voiceState,
    isActive: voiceIsActive
  } = useContinuousVoiceRecorder({
    volumeThreshold: 0.02,
    silenceDuration: 800,
    onData: (data: Float32Array) => {
      if (!(window as any)._audioSampleRate) {
        ;(window as any)._audioSampleRate = new (
          window.AudioContext || (window as any).webkitAudioContext
        )().sampleRate
      }
      const sampleRate = (window as any)._audioSampleRate
      triggerHook('speech.stream.data', { data, sampleRate })
    },
    onStart: async () => {
      if (!(window as any)._audioSampleRate) {
        ;(window as any)._audioSampleRate = new (
          window.AudioContext || (window as any).webkitAudioContext
        )().sampleRate
      }
      const sampleRate = (window as any)._audioSampleRate
      await triggerHook('speech.stream.start', {
        sampleRate,
        providerId: defaultModels.value.speechProviderId || options.chatProviderId.value,
        onResult: (text: string) => {
          if (!text) return
          options.message.value += (options.message.value ? ' ' : '') + text
          partialSpeechText.value = ''
          options.onRecognizedText()
        },
        onPartial: (text: string) => {
          partialSpeechText.value = text
        }
      })
    },
    onStop: async () => {
      try {
        await triggerHook('speech.stream.stop')
      } catch (error) {
        console.error('语音识别停止失败:', error)
      } finally {
        partialSpeechText.value = ''
      }
    }
  })

  watch(voiceState, (newState) => {
    isListening.value = newState === 'listening'
    isRecording.value = newState === 'recording'
  })

  const toggleVoiceRecording = async () => {
    if (voiceIsActive.value) {
      stopVoice()
      return
    }
    if (!defaultModels.value.speechModelId) {
      messageApi.error('请先在设置中选择默认语音转文字模型')
      return
    }
    await startVoice()
  }

  const toggleSpeech = () => {
    const newState = !speechEnabled.value
    if (newState) {
      const speechModel = options.currentChatAgent.value?.speechModel
      if (!speechModel?.modelId || !speechModel?.providerId) {
        messageApi.error('请先在智能体设置中选择语音模型')
        return
      }
      const voice = options.currentChatAgent.value?.speechVoice
      if (!voice) {
        messageApi.error('请先在智能体设置中选择语音音色')
        return
      }
    }

    updateSpeechEnabled(newState)
    if (!newState) {
      speechStore.stop()
      speechStore.clearQueue()
    }
  }

  return {
    speechEnabled,
    isRecording,
    isListening,
    isProcessingVoice,
    partialSpeechText,
    voiceIsActive,
    toggleVoiceRecording,
    toggleSpeech
  }
}
