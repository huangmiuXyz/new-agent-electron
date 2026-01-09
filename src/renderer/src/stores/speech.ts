import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AudioChunk {
  id: string
  messageId: string
  text: string
  audioData?: string // base64, optional while loading
  played: boolean
  loading: boolean
}

export const useSpeechStore = defineStore('speech', () => {
  const queue = ref<AudioChunk[]>([])
  const isPlaying = ref(false)
  const isWaiting = ref(false)
  const currentChunkId = ref<string | null>(null)
  const audioPlayer = new Audio()

  const currentChunk = computed(() =>
    queue.value.find(chunk => chunk.id === currentChunkId.value)
  )

  const createPlaceholder = (id: string, messageId: string, text: string) => {
    const chunk: AudioChunk = {
      id,
      messageId,
      text,
      played: false,
      loading: true
    }
    queue.value.push(chunk)
    return chunk
  }

  const fulfillChunk = (id: string, audioData: string) => {
    const chunk = queue.value.find(c => c.id === id)
    if (chunk) {
      chunk.audioData = audioData
      chunk.loading = false
      if (isWaiting.value || !isPlaying.value) {
        isWaiting.value = false
        playNext()
      }
    }
  }

  const addToQueue = (chunk: AudioChunk) => {
    queue.value.push(chunk)
    if (!isPlaying.value && !isWaiting.value) {
      playNext()
    }
  }

  const playNext = async () => {
    // Find the first unplayed chunk.
    const nextIndex = queue.value.findIndex(chunk => !chunk.played)
    if (nextIndex === -1) {
      isPlaying.value = false
      isWaiting.value = false
      currentChunkId.value = null
      return
    }

    const nextChunk = queue.value[nextIndex]

    // If the next chunk is still loading, we MUST wait for it to maintain order.
    if (nextChunk.loading || !nextChunk.audioData) {
      isPlaying.value = false
      isWaiting.value = true // Set waiting flag
      return
    }

    isWaiting.value = false
    isPlaying.value = true
    currentChunkId.value = nextChunk.id

    const blob = await fetch(`data:audio/mpeg;base64,${nextChunk.audioData}`).then(r => r.blob())
    const url = URL.createObjectURL(blob)

    audioPlayer.src = url
    audioPlayer.play()

    audioPlayer.onended = () => {
      nextChunk.played = true
      URL.revokeObjectURL(url)
      playNext()
    }

    audioPlayer.onerror = () => {
      console.error('Audio playback error')
      nextChunk.played = true
      URL.revokeObjectURL(url)
      playNext()
    }
  }

  const stop = () => {
    audioPlayer.pause()
    isPlaying.value = false
    isWaiting.value = false
    currentChunkId.value = null
    // Mark all current queue as played or clear it?
    // User might want to stop the current speech sequence.
    queue.value.forEach(chunk => chunk.played = true)
  }

  const clearQueue = () => {
    stop()
    queue.value = []
  }

  return {
    queue,
    isPlaying,
    currentChunkId,
    currentChunk,
    addToQueue,
    createPlaceholder,
    fulfillChunk,
    stop,
    clearQueue
  }
})
