import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AudioChunk {
  id: string
  messageId: string
  text: string
  audioData: string // base64
  played: boolean
}

export const useSpeechStore = defineStore('speech', () => {
  const queue = ref<AudioChunk[]>([])
  const isPlaying = ref(false)
  const currentChunkId = ref<string | null>(null)
  const audioPlayer = new Audio()

  const currentChunk = computed(() => 
    queue.value.find(chunk => chunk.id === currentChunkId.value)
  )

  const addToQueue = (chunk: AudioChunk) => {
    queue.value.push(chunk)
    if (!isPlaying.value) {
      playNext()
    }
  }

  const playNext = async () => {
    const nextChunk = queue.value.find(chunk => !chunk.played)
    if (!nextChunk) {
      isPlaying.value = false
      currentChunkId.value = null
      return
    }

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
    stop,
    clearQueue
  }
})
