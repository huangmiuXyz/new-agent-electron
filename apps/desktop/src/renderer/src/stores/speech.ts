import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AudioChunk {
  id: string
  messageId: string
  text: string
  audioData?: string
  audioMediaType?: string
  audioFormat?: string
  providerId?: string
  providerName?: string
  modelId?: string
  modelName?: string
  kind?: 'speech' | 'music'
  played: boolean
  loading: boolean
  duration?: number
  error?: string
}

export const useSpeechStore = defineStore('speech', () => {
  const queue = ref<AudioChunk[]>([])
  const isPlaying = ref(false)
  const isWaiting = ref(false)
  const currentChunkId = ref<string | null>(null)
  const currentTime = ref(0)
  const duration = ref(0)
  const audioPlayer = new Audio()

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

  const createPlaceholder = (
    id: string,
    messageId: string,
    text: string,
    metadata?: Partial<Pick<AudioChunk, 'providerId' | 'providerName' | 'modelId' | 'modelName' | 'kind'>>
  ) => {
    const chunk: AudioChunk = {
      id,
      messageId,
      text,
      played: false,
      loading: true,
      audioMediaType: 'audio/mpeg',
      ...metadata
    }
    queue.value.push(chunk)

    if (!isPlaying.value && !isWaiting.value) {
      playNext()
    }

    return chunk
  }

  const fulfillChunk = (
    id: string,
    audioData: string,
    metadata?: Partial<Pick<AudioChunk, 'audioMediaType' | 'audioFormat'>>
  ): Promise<number> => {
    return new Promise((resolve) => {
      const chunk = queue.value.find((c) => c.id === id)
      if (!chunk) {
        resolve(0)
        return
      }

      chunk.audioData = audioData
      chunk.loading = false
      chunk.error = undefined
      chunk.audioMediaType = metadata?.audioMediaType || chunk.audioMediaType || 'audio/mpeg'
      chunk.audioFormat = metadata?.audioFormat || chunk.audioFormat

      const tempAudio = new Audio(`data:${chunk.audioMediaType};base64,${audioData}`)
      tempAudio.onloadedmetadata = () => {
        chunk.duration = tempAudio.duration

        if (isWaiting.value || !isPlaying.value) {
          isWaiting.value = false
          playNext()
        }
        resolve(tempAudio.duration)
      }
      tempAudio.onerror = () => {
        if (isWaiting.value || !isPlaying.value) {
          isWaiting.value = false
          playNext()
        }
        resolve(0)
      }
    })
  }

  const markChunkError = (id: string, errorMessage: string) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (chunk) {
      chunk.loading = false
      chunk.error = errorMessage
      chunk.played = true
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

  const replaceQueue = (chunks: AudioChunk[], startChunkId?: string) => {
    stop()
    queue.value = chunks.map(chunk => ({
      ...chunk,
      played: !!chunk.error && !chunk.audioData,
      loading: !!chunk.loading
    }))

    if (queue.value.length === 0) {
      return
    }

    if (startChunkId) {
      jumpToChunk(startChunkId)
      return
    }

    playNext()
  }

  const removeChunk = (id: string) => {
    const index = queue.value.findIndex((c) => c.id === id)
    if (index !== -1) {
      const isCurrent = currentChunkId.value === id
      queue.value.splice(index, 1)
      if (isCurrent) {
        audioPlayer.pause()
        playNext()
      } else if (isWaiting.value) {
        playNext()
      }
    }
  }

  const playNext = async () => {
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
    if (nextChunk.loading || !nextChunk.audioData) {
      isPlaying.value = false
      isWaiting.value = true
      return
    }

    isWaiting.value = false
    isPlaying.value = true
    currentChunkId.value = nextChunk.id

    const dataUrl = `data:${nextChunk.audioMediaType || 'audio/mpeg'};base64,${nextChunk.audioData}`
    const blob = await fetch(dataUrl).then(r => r.blob())
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
    audioPlayer.currentTime = 0
    audioPlayer.removeAttribute('src')
    audioPlayer.load()
    isPlaying.value = false
    isWaiting.value = false
    currentChunkId.value = null
    currentTime.value = 0
    duration.value = 0
    queue.value.forEach(chunk => {
      chunk.played = !!chunk.error
    })
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
    replaceQueue,
    createPlaceholder,
    fulfillChunk,
    markChunkError,
    removeChunk,
    seek,
    jumpToChunk,
    togglePlay,
    stop,
    clearQueue
  }
})
