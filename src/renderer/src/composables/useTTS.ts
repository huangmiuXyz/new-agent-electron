import { ref, watch } from 'vue'

interface MessageQueueItem {
  messageId: string
  fullText: string
  lastProcessedIndex: number
  pendingText: string
  isComplete: boolean
}

// Global state to persist across component unmounts
const isSpeaking = ref(false)
const currentMessageId = ref<string | null>(null)
const currentSpeakingSentence = ref('')
const messageQueue = ref<MessageQueueItem[]>([])
let utterances: SpeechSynthesisUtterance[] = []
let isWatcherInitialized = false

export const useTTS = () => {
  const synth = window.speechSynthesis
  const settingsStore = useSettingsStore()

  const stop = () => {
    synth.cancel()
    utterances = []
    messageQueue.value = []
    isSpeaking.value = false
    currentMessageId.value = null
    currentSpeakingSentence.value = ''
  }

  // Initialize global watcher once
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

  const speakChunk = (text: string, messageId: string) => {
    if (!text.trim()) return

    const utterance = new SpeechSynthesisUtterance(text)
    const ttsSettings = settingsStore.speech.tts
    if (!ttsSettings?.enabled) return

    utterance.rate = ttsSettings.rate || 1
    utterance.pitch = ttsSettings.pitch || 1
    utterance.volume = ttsSettings.volume || 1

    if (ttsSettings.voice) {
      const voices = synth.getVoices()
      const selectedVoice = voices.find((v) => v.name === ttsSettings.voice)
      if (selectedVoice) {
        utterance.voice = selectedVoice
      }
    }

    utterance.onstart = () => {
      isSpeaking.value = true
      currentMessageId.value = messageId
      currentSpeakingSentence.value = text
    }

    utterance.onend = () => {
      utterances = utterances.filter((u) => u !== utterance)
      if (utterances.length === 0) {
        // When one utterance ends, check if there's more in the current message or next message
        processNext()
      }
    }

    utterance.onerror = () => {
      utterances = utterances.filter((u) => u !== utterance)
      processNext()
    }

    utterances.push(utterance)
    synth.speak(utterance)
  }

  const processNext = () => {
    const ttsSettings = settingsStore.speech.tts
    if (!ttsSettings?.enabled) {
      stop()
      return
    }

    if (synth.speaking || messageQueue.value.length === 0) {
      if (messageQueue.value.length === 0 && !synth.speaking) {
        isSpeaking.value = false
      }
      return
    }

    const currentItem = messageQueue.value[0]
    const punctuationRegex = /[.!?。！？\n]/g
    let match
    let searchIndex = 0

    while ((match = punctuationRegex.exec(currentItem.pendingText.substring(searchIndex))) !== null) {
      const pIndex = searchIndex + match.index
      const chunk = currentItem.pendingText.substring(0, pIndex + 1)
      if (chunk.trim()) {
        speakChunk(chunk, currentItem.messageId)
      }
      currentItem.pendingText = currentItem.pendingText.substring(pIndex + 1)
      punctuationRegex.lastIndex = 0
      searchIndex = 0

      // If we started speaking, stop processing this buffer for now
      if (synth.speaking) return
    }

    if (currentItem.isComplete && currentItem.pendingText.trim()) {
      speakChunk(currentItem.pendingText, currentItem.messageId)
      currentItem.pendingText = ''
      return
    }

    // If current item is complete and no more pending text, move to next message
    if (currentItem.isComplete && !currentItem.pendingText.trim() && !synth.speaking) {
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
