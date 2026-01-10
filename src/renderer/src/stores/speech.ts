import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AudioChunk {
  id: string
  messageId: string
  text: string
  audioData?: string // base64, optional while loading
  played: boolean
  loading: boolean
  duration?: number // duration in seconds
}

export const useSpeechStore = defineStore('speech', () => {
  const queue = ref<AudioChunk[]>([])
  const isPlaying = ref(false)
  const isWaiting = ref(false)
  const currentChunkId = ref<string | null>(null)
  const currentTime = ref(0)
  const duration = ref(0)
  const audioPlayer = new Audio()

  // Update current time during playback
  audioPlayer.ontimeupdate = () => {
    currentTime.value = audioPlayer.currentTime
    duration.value = audioPlayer.duration || 0
  }

  const currentChunkIndex = computed(() =>
    queue.value.findIndex(chunk => chunk.id === currentChunkId.value)
  )

  const currentChunk = computed(() =>
    queue.value[currentChunkIndex.value]
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

      // Get duration from audio data
      const tempAudio = new Audio(`data:audio/mpeg;base64,${audioData}`)
      tempAudio.onloadedmetadata = () => {
        chunk.duration = tempAudio.duration
      }

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
      currentTime.value = 0
      duration.value = 0
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

  const seek = (time: number) => {
    audioPlayer.currentTime = time
  }

  const jumpToChunk = (id: string) => {
    const index = queue.value.findIndex(c => c.id === id)
    if (index !== -1) {
      // Mark all chunks before this as played, and this and after as unplayed
      queue.value.forEach((c, i) => {
        if (i < index) c.played = true
        else c.played = false
      })
      playNext()
    }
  }

  const togglePlay = () => {
    if (isPlaying.value) {
      audioPlayer.pause()
      isPlaying.value = false
    } else if (currentChunkId.value) {
      audioPlayer.play()
      isPlaying.value = true
    } else {
      playNext()
    }
  }

  const stop = () => {
    audioPlayer.pause()
    isPlaying.value = false
    isWaiting.value = false
    currentChunkId.value = null
    currentTime.value = 0
    duration.value = 0
    // Mark all current queue as played
    queue.value.forEach(chunk => chunk.played = true)
  }

  const clearQueue = () => {
    stop()
    queue.value = []
  }

  return {
    queue,
    isPlaying,
    isWaiting,
    currentChunkId,
    currentChunk,
    currentChunkIndex,
    currentTime,
    duration,
    addToQueue,
    createPlaceholder,
    fulfillChunk,
    seek,
    jumpToChunk,
    togglePlay,
    stop,
    clearQueue
  }
})
