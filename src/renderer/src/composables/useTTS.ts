import { ref, onUnmounted } from 'vue'

// Global state to persist across component unmounts
const isSpeaking = ref(false)
const currentMessageId = ref<string | null>(null)
const currentSpeakingText = ref('')
const currentSpeakingSentence = ref('')
let lastProcessedIndex = 0
let pendingText = ''
let utterances: SpeechSynthesisUtterance[] = []

export const useTTS = () => {
  const synth = window.speechSynthesis
  const settingsStore = useSettingsStore()

  const stop = () => {
    synth.cancel()
    utterances = []
    pendingText = ''
    lastProcessedIndex = 0
    isSpeaking.value = false
    currentMessageId.value = null
    currentSpeakingText.value = ''
    currentSpeakingSentence.value = ''
  }

  const speakChunk = (text: string, messageId: string) => {
    console.log('TTS Speak Chunk:', text)
    if (!text.trim()) return

    const utterance = new SpeechSynthesisUtterance(text)

    // Use settings from store if available, otherwise defaults
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
        isSpeaking.value = false
        // Don't clear messageId here, so UI can keep highlight until next chunk or stop
      }
    }

    utterance.onerror = () => {
      utterances = utterances.filter((u) => u !== utterance)
      if (utterances.length === 0) {
        isSpeaking.value = false
      }
    }

    utterances.push(utterance)
    synth.speak(utterance)
  }

  const processBuffer = (messageId: string, isComplete: boolean) => {
    const punctuationRegex = /[.!?。！？\n]/g
    let match

    let searchIndex = 0
    while ((match = punctuationRegex.exec(pendingText.substring(searchIndex))) !== null) {
      const pIndex = searchIndex + match.index
      const chunk = pendingText.substring(0, pIndex + 1)
      if (chunk.trim()) {
        speakChunk(chunk, messageId)
      }
      pendingText = pendingText.substring(pIndex + 1)
      punctuationRegex.lastIndex = 0
      searchIndex = 0
    }

    if (isComplete && pendingText.trim()) {
      speakChunk(pendingText, messageId)
      pendingText = ''
    }
  }

  const update = (messageId: string, fullText: string, isComplete: boolean = false) => {
    const ttsSettings = settingsStore.speech.tts
    if (!ttsSettings?.enabled) return

    // If messageId changes, we are starting a new message
    if (currentMessageId.value && currentMessageId.value !== messageId) {
      // If we're already speaking a different message, we might want to stop or queue
      // For now, let's stop and start the new one
      stop()
    }

    currentMessageId.value = messageId
    currentSpeakingText.value = fullText

    const newText = fullText.substring(lastProcessedIndex)
    if (!newText && !isComplete) return

    pendingText += newText
    lastProcessedIndex = fullText.length
    processBuffer(messageId, isComplete)
  }

  return {
    update,
    stop,
    isSpeaking,
    currentMessageId,
    currentSpeakingText,
    currentSpeakingSentence
  }
}
