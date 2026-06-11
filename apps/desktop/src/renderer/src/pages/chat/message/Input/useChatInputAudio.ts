import type { FileUIPart, TextUIPart } from 'ai'
import type { InputAudioItem } from '@renderer/composables/useInputAudioRecorder'
import { useInputAudioRecorder } from '@renderer/composables/useInputAudioRecorder'
import { messageApi } from '@renderer/utils/messages'
import { computed, ref } from 'vue'

type ChatMessagePart = FileUIPart | TextUIPart

interface UseChatInputAudioOptions {
  ensureSendableChat: () => string | null
  sendMessageParts: (chatId: string, parts: ChatMessagePart[]) => void
}

const buildAudioFilePart = (audio: InputAudioItem): FileUIPart => ({
  type: 'file',
  mediaType: audio.mediaType,
  filename: audio.filename,
  url: audio.dataUrl
})

export function useChatInputAudio(options: UseChatInputAudioOptions) {
  const selectedAudioInputs = ref<InputAudioItem[]>([])
  const showInputAudioControls = ref(false)

  const removeAudioInput = (index: number) => {
    const [audio] = selectedAudioInputs.value.splice(index, 1)
    if (audio?.blobUrl) {
      URL.revokeObjectURL(audio.blobUrl)
    }
  }

  const clearAudioInputs = () => {
    selectedAudioInputs.value.forEach((audio) => {
      if (audio.blobUrl) URL.revokeObjectURL(audio.blobUrl)
    })
    selectedAudioInputs.value = []
  }

  const sendInputAudioImmediately = async (audio: InputAudioItem) => {
    const chatId = options.ensureSendableChat()
    if (!chatId) {
      URL.revokeObjectURL(audio.blobUrl)
      return
    }

    options.sendMessageParts(chatId, [buildAudioFilePart(audio)])
    URL.revokeObjectURL(audio.blobUrl)
  }

  const {
    startManual: startManualInputAudio,
    stopManual: stopManualInputAudio,
    startContinuous: startContinuousInputAudio,
    stopContinuous: stopContinuousInputAudio,
    stop: stopInputAudio,
    state: inputAudioState,
    mode: inputAudioMode,
    isActive: inputAudioIsActive,
    level: inputAudioLevel
  } = useInputAudioRecorder({
    silenceDuration: 1000,
    onAutoAudio: sendInputAudioImmediately
  })

  const isManualInputAudioRecording = computed(
    () => inputAudioMode.value === 'manual' && inputAudioState.value === 'recording'
  )

  const isContinuousInputAudioActive = computed(
    () => inputAudioMode.value === 'continuous' && inputAudioIsActive.value
  )

  const closeInputAudioPanel = async () => {
    if (isManualInputAudioRecording.value) {
      const audio = await stopManualInputAudio()
      if (audio) {
        selectedAudioInputs.value.push(audio)
      }
    } else if (isContinuousInputAudioActive.value) {
      stopContinuousInputAudio()
    } else {
      stopInputAudio()
    }
    showInputAudioControls.value = false
  }

  const toggleInputAudioPanel = async () => {
    if (showInputAudioControls.value || inputAudioIsActive.value) {
      await closeInputAudioPanel()
      return
    }
    showInputAudioControls.value = true
  }

  const toggleManualInputAudio = async () => {
    try {
      showInputAudioControls.value = true
      if (isManualInputAudioRecording.value) {
        await closeInputAudioPanel()
        return
      }
      if (isContinuousInputAudioActive.value) {
        stopContinuousInputAudio()
      }
      await startManualInputAudio()
    } catch (error) {
      messageApi.error((error as Error).message || '音频录入失败')
    }
  }

  const toggleContinuousInputAudio = async () => {
    try {
      showInputAudioControls.value = true
      if (isContinuousInputAudioActive.value) {
        await closeInputAudioPanel()
        return
      }
      if (isManualInputAudioRecording.value) {
        const audio = await stopManualInputAudio()
        if (audio) selectedAudioInputs.value.push(audio)
      }
      await startContinuousInputAudio()
    } catch (error) {
      messageApi.error((error as Error).message || '连续音频录入失败')
    }
  }

  const buildAudioFileParts = () => selectedAudioInputs.value.map(buildAudioFilePart)

  const disposeInputAudio = () => {
    stopInputAudio()
    clearAudioInputs()
  }

  return {
    selectedAudioInputs,
    showInputAudioControls,
    inputAudioIsActive,
    inputAudioLevel,
    isManualInputAudioRecording,
    isContinuousInputAudioActive,
    buildAudioFileParts,
    removeAudioInput,
    clearAudioInputs,
    toggleInputAudioPanel,
    toggleManualInputAudio,
    toggleContinuousInputAudio,
    disposeInputAudio
  }
}
