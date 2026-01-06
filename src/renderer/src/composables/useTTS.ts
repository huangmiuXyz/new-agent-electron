import { ref, watch } from 'vue'

interface MessageQueueItem {
  messageId: string
  fullText: string
  lastProcessedIndex: number
  pendingText: string
  isComplete: boolean
}

const isSpeaking = ref(false)
const currentMessageId = ref<string | null>(null)
const currentSpeakingSentence = ref('')
const messageQueue = ref<MessageQueueItem[]>([])
let isWatcherInitialized = false

export const useTTS = () => {
  const settingsStore = useSettingsStore()

  const stop = () => {
    ttsService.stop()
    messageQueue.value = []
    isSpeaking.value = false
    currentMessageId.value = null
    currentSpeakingSentence.value = ''
  }

  if (!isWatcherInitialized) {
    watch(
      () => settingsStore.speech?.tts?.enabled,
      (enabled) => {
        if (!enabled) {
          stop()
        }
      },
      { immediate: true }
    )
    isWatcherInitialized = true
  }

  const processNext = () => {
    const ttsSettings = settingsStore.speech.tts as TTSSettings
    if (!ttsSettings?.enabled) {
      stop()
      return
    }

    if (ttsService.isSpeaking() || messageQueue.value.length === 0) {
      if (messageQueue.value.length === 0 && !ttsService.isSpeaking()) {
        isSpeaking.value = false
        currentMessageId.value = null
        currentSpeakingSentence.value = ''
      }
      return
    }

    const currentItem = messageQueue.value[0]

    const { chunks, remaining } = ttsService.splitText(
      currentItem.pendingText,
      ttsSettings.triggerMode
    )

    if (chunks.length > 0) {
      chunks.forEach(chunk => {
        ttsService.speak(chunk, ttsSettings, {
          onStart: (text) => {
            isSpeaking.value = true
            currentMessageId.value = currentItem.messageId
            currentSpeakingSentence.value = text
          },
          onEnd: () => {
            processNext()
          },
          onError: () => {
            processNext()
          }
        })
      })
      currentItem.pendingText = remaining
      return
    }

    if (currentItem.isComplete && currentItem.pendingText.trim()) {
      ttsService.speak(currentItem.pendingText, ttsSettings, {
        onStart: (text) => {
          isSpeaking.value = true
          currentMessageId.value = currentItem.messageId
          currentSpeakingSentence.value = text
        },
        onEnd: () => {
          processNext()
        }
      })
      currentItem.pendingText = ''
      return
    }

    if (currentItem.isComplete && !currentItem.pendingText.trim() && !ttsService.isSpeaking()) {
      messageQueue.value.shift()
      processNext()
    }
  }

  const update = (messageId: string, fullText: string, isComplete: boolean = false) => {
    const ttsSettings = settingsStore.speech.tts
    if (!ttsSettings?.enabled) {
      if (isSpeaking.value || messageQueue.value.length > 0) {
        stop()
      }
      return
    }

    let item = messageQueue.value.find((i) => i.messageId === messageId)

    if (!item) {
      item = {
        messageId,
        fullText: '',
        lastProcessedIndex: 0,
        pendingText: '',
        isComplete: false
      }
      messageQueue.value.push(item)
    }

    const newText = fullText.substring(item.lastProcessedIndex)
    if (newText || isComplete) {
      item.pendingText += newText
      item.lastProcessedIndex = fullText.length
      item.isComplete = isComplete
      item.fullText = fullText
      processNext()
    }
  }

  return {
    update,
    stop,
    isSpeaking,
    currentMessageId,
    currentSpeakingSentence
  }
}
