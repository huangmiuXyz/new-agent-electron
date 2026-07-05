import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { concatUint8Arrays, uint8ArrayToBase64 } from '@renderer/utils'

export interface AudioChunk {
  id: string
  messageId: string
  text: string
  audioData?: string
  audioMediaType?: string
  audioFormat?: string
  streaming?: boolean
  streamChunks?: Uint8Array[]
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
  const volume = ref(1)
  audioPlayer.volume = volume.value
  watch(volume, (v) => {
    audioPlayer.volume = v
    if (audioQueuePlayback?.currentAudio) {
      audioQueuePlayback.currentAudio.volume = v
    }
  })

  type ActiveStreamPlayback = {
    chunkId: string
    mediaSource: MediaSource
    sourceBuffer?: SourceBuffer
    objectUrl: string
    pending: Uint8Array[]
    finished: boolean
    mediaType: string
  }

  let activeStreamPlayback: ActiveStreamPlayback | null = null

  type AudioQueuePlayback = {
    chunkId: string
    queue: Blob[]
    playing: boolean
    finished: boolean
    mediaType: string
    currentAudio: HTMLAudioElement | null
    accumulatedDuration: number
  }

  let audioQueuePlayback: AudioQueuePlayback | null = null

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
      chunk.streaming = false
      chunk.error = undefined
      chunk.audioMediaType = metadata?.audioMediaType || chunk.audioMediaType || 'audio/mpeg'
      chunk.audioFormat = metadata?.audioFormat || chunk.audioFormat

      if (audioQueuePlayback?.chunkId === id) {
        audioQueuePlayback.finished = true
        if (!audioQueuePlayback.playing && audioQueuePlayback.queue.length === 0) {
          chunk.played = true
          cleanupAudioQueuePlayback()
          if (isWaiting.value || !isPlaying.value) {
            isWaiting.value = false
            playNext()
          }
          resolve(chunk.duration || 0)
          return
        }
        if (!chunk.duration) {
          const durAudio = new Audio(`data:${chunk.audioMediaType};base64,${chunk.audioData}`)
          durAudio.onloadedmetadata = () => {
            chunk.duration = durAudio.duration
            duration.value = durAudio.duration
            resolve(durAudio.duration)
          }
          durAudio.onerror = () => resolve(0)
        } else {
          resolve(chunk.duration)
        }
        return
      }

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

  const updateChunkText = (id: string, text: string) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (chunk) {
      chunk.text = text
    }
  }

  const appendChunkText = (id: string, text: string) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (chunk) {
      chunk.text += text
    }
  }

  const startStreamChunk = (
    id: string,
    metadata?: Partial<Pick<AudioChunk, 'audioMediaType' | 'audioFormat'>>
  ) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (!chunk) return

    chunk.streaming = true
    chunk.loading = true
    chunk.error = undefined
    chunk.streamChunks = chunk.streamChunks || []
    chunk.audioMediaType = metadata?.audioMediaType || chunk.audioMediaType || 'audio/mpeg'
    chunk.audioFormat = metadata?.audioFormat || chunk.audioFormat

    if (!isPlaying.value && isWaiting.value) {
      playNext()
    }
  }

  const appendStreamChunk = (
    id: string,
    data: Uint8Array,
    metadata?: Partial<Pick<AudioChunk, 'audioMediaType' | 'audioFormat'>>
  ) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (!chunk) return

    chunk.streaming = true
    chunk.loading = true
    chunk.error = undefined
    chunk.streamChunks = chunk.streamChunks || []
    chunk.streamChunks.push(data)
    chunk.audioMediaType = metadata?.audioMediaType || chunk.audioMediaType || 'audio/mpeg'
    chunk.audioFormat = metadata?.audioFormat || chunk.audioFormat

    if (activeStreamPlayback?.chunkId === id) {
      activeStreamPlayback.pending.push(data)
      pumpActiveStream()
    } else if (audioQueuePlayback?.chunkId === id) {
      audioQueuePlayback.queue.push(new Blob([new Uint8Array(data)], { type: audioQueuePlayback.mediaType }))
      if (!audioQueuePlayback.playing) {
        playNextAudioFromQueue()
      }
    } else if (!isPlaying.value && isWaiting.value) {
      playNext()
    }
  }

  const finishStreamChunk = (
    id: string,
    metadata?: Partial<Pick<AudioChunk, 'audioMediaType' | 'audioFormat'>>
  ): Promise<number> => {
    const chunk = queue.value.find((c) => c.id === id)
    if (!chunk) return Promise.resolve(0)

    const bytes = concatUint8Arrays(chunk.streamChunks || [])
    if (!chunk.audioData) {
      chunk.audioData = uint8ArrayToBase64(bytes)
    }
    // 转换完成后立即清空 streamChunks，避免同一音频数据以 Uint8Array[] 和 base64 string
    // 两种格式同时驻留内存。一个 10s/128kbps 的音频 chunk 约 160KB binary + 213KB base64，
    // 多个 chunk 累积会导致显著内存浪费。
    chunk.streamChunks = undefined
    chunk.loading = false
    chunk.streaming = false
    chunk.error = undefined
    chunk.audioMediaType = metadata?.audioMediaType || chunk.audioMediaType || 'audio/mpeg'
    chunk.audioFormat = metadata?.audioFormat || chunk.audioFormat

    const finalizeActiveStream = () => {
      if (activeStreamPlayback?.chunkId !== id) return
      activeStreamPlayback.finished = true
      pumpActiveStream()
    }

    const finalizeAudioQueue = () => {
      if (audioQueuePlayback?.chunkId !== id) return
      audioQueuePlayback.finished = true
      if (!audioQueuePlayback.playing && audioQueuePlayback.queue.length === 0) {
        chunk.played = true
        cleanupAudioQueuePlayback()
        if (isWaiting.value || !isPlaying.value) {
          isWaiting.value = false
          playNext()
        }
      }
    }

    if (bytes.byteLength === 0) {
      finalizeActiveStream()
      finalizeAudioQueue()
      return Promise.resolve(0)
    }

    const durationPromise = new Promise<number>((resolve) => {
      const tempAudio = new Audio(`data:${chunk.audioMediaType};base64,${chunk.audioData}`)
      tempAudio.onloadedmetadata = () => {
        chunk.duration = tempAudio.duration
        resolve(tempAudio.duration)
      }
      tempAudio.onerror = () => resolve(0)
    })

    finalizeActiveStream()
    finalizeAudioQueue()

    if (isWaiting.value || !isPlaying.value) {
      isWaiting.value = false
      playNext()
    }

    return durationPromise
  }

  const markChunkError = (id: string, errorMessage: string) => {
    const chunk = queue.value.find((c) => c.id === id)
    if (chunk) {
      chunk.loading = false
      chunk.streaming = false
      chunk.error = errorMessage
      chunk.played = true
      const wasActiveStream = activeStreamPlayback?.chunkId === id
      if (wasActiveStream) {
        activeStreamPlayback!.finished = true
        try {
          if (activeStreamPlayback!.mediaSource.readyState === 'open') {
            activeStreamPlayback!.mediaSource.endOfStream('decode')
          }
        } catch {
          // Ignore MediaSource shutdown errors; the chunk is already marked failed.
        }
        cleanupActiveStream()
      }
      if (audioQueuePlayback?.chunkId === id) {
        cleanupAudioQueuePlayback()
      }
      isWaiting.value = false
      playNext()
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

    if (nextChunk.id === currentChunkId.value && (isPlaying.value || isWaiting.value)) {
      return
    }

    if (nextChunk.streaming || (nextChunk.streamChunks?.length && !nextChunk.audioData)) {
      playStreamChunk(nextChunk)
      return
    }

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
    audioPlayer.play().catch(() => {})

    audioPlayer.onended = () => {
      nextChunk.played = true
      // 已播放完成的 chunk 清除音频数据，避免 base64 字符串长期驻留内存。
      // 如果用户需要重播，会从消息 metadata 中重新加载。
      nextChunk.audioData = undefined
      nextChunk.streamChunks = undefined
      URL.revokeObjectURL(url)
      playNext()
    }

    audioPlayer.onerror = () => {
      console.error('Audio playback error')
      nextChunk.played = true
      nextChunk.audioData = undefined
      nextChunk.streamChunks = undefined
      URL.revokeObjectURL(url)
      playNext()
    }
  }

  const cleanupActiveStream = () => {
    if (!activeStreamPlayback) return
    URL.revokeObjectURL(activeStreamPlayback.objectUrl)
    activeStreamPlayback = null
  }

  const shouldEndActiveStream = (playback: ActiveStreamPlayback) =>
    playback.finished &&
    playback.pending.length === 0 &&
    playback.sourceBuffer &&
    !playback.sourceBuffer.updating &&
    playback.mediaSource.readyState === 'open'

  const pumpActiveStream = () => {
    const playback = activeStreamPlayback
    if (!playback?.sourceBuffer || playback.sourceBuffer.updating) return

    const next = playback.pending.shift()
    if (next) {
      try {
        const buffer = new ArrayBuffer(next.byteLength)
        new Uint8Array(buffer).set(next)
        playback.sourceBuffer.appendBuffer(buffer)
      } catch (error) {
        console.error('Failed to append speech stream chunk:', error)
        markChunkError(playback.chunkId, error instanceof Error ? error.message : String(error))
      }
      return
    }

    if (shouldEndActiveStream(playback)) {
      try {
        playback.mediaSource.endOfStream()
      } catch {
        // The stream may already be closing.
      }
    }
  }

  const playNextAudioFromQueue = () => {
    const q = audioQueuePlayback
    if (!q || q.playing) return

    if (q.queue.length === 0) {
      if (q.finished) {
        const chunk = queue.value.find(c => c.id === q.chunkId)
        if (chunk) {
          chunk.played = true
          chunk.streaming = false
        }
        cleanupAudioQueuePlayback()
        isWaiting.value = false
        if (isPlaying.value) {
          isPlaying.value = false
        }
        playNext()
      }
      return
    }

    q.playing = true
    const blob = q.queue.shift()!
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.volume = volume.value
    q.currentAudio = audio

    if (!duration.value) {
      audio.addEventListener('loadedmetadata', () => {
        duration.value = q.accumulatedDuration + audio.duration
      }, { once: true })
    }
    audio.addEventListener('timeupdate', () => {
      currentTime.value = q.accumulatedDuration + audio.currentTime
    })

    audio.onended = () => {
      q.accumulatedDuration += audio.duration || 0
      q.currentAudio = null
      URL.revokeObjectURL(url)
      q.playing = false
      // 清除已播放 chunk 的音频数据
      const playedChunk = queue.value.find(c => c.id === q.chunkId)
      if (playedChunk) {
        playedChunk.audioData = undefined
        playedChunk.streamChunks = undefined
      }
      playNextAudioFromQueue()
    }
    audio.onerror = () => {
      q.currentAudio = null
      URL.revokeObjectURL(url)
      q.playing = false
      const errChunk = queue.value.find(c => c.id === q.chunkId)
      if (errChunk) {
        errChunk.audioData = undefined
        errChunk.streamChunks = undefined
      }
      playNextAudioFromQueue()
    }
    audio.play().catch(() => {
      q.currentAudio = null
      URL.revokeObjectURL(url)
      q.playing = false
      playNextAudioFromQueue()
    })
  }

  const cleanupAudioQueuePlayback = () => {
    const q = audioQueuePlayback
    if (q?.currentAudio) {
      q.currentAudio.pause()
      q.currentAudio.src = ''
    }
    audioQueuePlayback = null
  }

  const playStreamChunk = (chunk: AudioChunk) => {
    const mediaType = chunk.audioMediaType || 'audio/mpeg'
    if (
      typeof MediaSource === 'undefined' ||
      !MediaSource.isTypeSupported(mediaType)
    ) {
      cleanupAudioQueuePlayback()
      cleanupActiveStream()
      audioPlayer.onended = null
      audioPlayer.onerror = null
      audioPlayer.removeAttribute('src')
      audioPlayer.load()
      currentTime.value = 0
      duration.value = 0
      isWaiting.value = false
      isPlaying.value = true
      currentChunkId.value = chunk.id

      const existingChunks = chunk.streamChunks || []
      const initialBlobs = existingChunks.map(data => new Blob([new Uint8Array(data)], { type: mediaType }))

      audioQueuePlayback = {
        chunkId: chunk.id,
        queue: initialBlobs,
        playing: false,
        finished: !chunk.loading && !chunk.streaming,
        mediaType,
        currentAudio: null,
        accumulatedDuration: 0
      }
      playNextAudioFromQueue()
      return
    }

    cleanupActiveStream()
    isWaiting.value = false
    isPlaying.value = true
    currentChunkId.value = chunk.id

    const mediaSource = new MediaSource()
    const objectUrl = URL.createObjectURL(mediaSource)
    const playback: ActiveStreamPlayback = {
      chunkId: chunk.id,
      mediaSource,
      objectUrl,
      pending: [...(chunk.streamChunks || [])],
      finished: !chunk.loading && !chunk.streaming,
      mediaType
    }
    activeStreamPlayback = playback

    mediaSource.addEventListener('sourceopen', () => {
      try {
        const sourceBuffer = mediaSource.addSourceBuffer(mediaType)
        playback.sourceBuffer = sourceBuffer
        sourceBuffer.mode = 'sequence'
        sourceBuffer.addEventListener('updateend', pumpActiveStream)
        pumpActiveStream()
      } catch (error) {
        console.error('Failed to start speech stream playback:', error)
        markChunkError(chunk.id, error instanceof Error ? error.message : String(error))
      }
    }, { once: true })

    audioPlayer.src = objectUrl
    audioPlayer.play().catch((error) => {
      console.error('Audio stream playback failed:', error)
    })

    audioPlayer.onended = () => {
      chunk.played = true
      chunk.audioData = undefined
      chunk.streamChunks = undefined
      cleanupActiveStream()
      playNext()
    }

    audioPlayer.onerror = () => {
      console.error('Audio stream playback error')
      chunk.played = true
      chunk.audioData = undefined
      chunk.streamChunks = undefined
      cleanupActiveStream()
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
      if (audioQueuePlayback?.currentAudio) {
        audioQueuePlayback.currentAudio.pause()
      }
      isPlaying.value = false
    } else if (currentChunkId.value) {
      if (audioQueuePlayback?.currentAudio) {
        audioQueuePlayback.currentAudio.play().catch(() => {})
      } else {
        audioPlayer.play().catch(() => {})
      }
      isPlaying.value = true
    } else {
      queue.value.forEach(chunk => {
        chunk.played = !!(chunk.error && !chunk.audioData)
      })
      playNext()
    }
  }

  const stop = () => {
    audioPlayer.pause()
    audioPlayer.currentTime = 0
    audioPlayer.onended = null
    audioPlayer.onerror = null
    audioPlayer.removeAttribute('src')
    audioPlayer.load()
    isPlaying.value = false
    isWaiting.value = false
    currentChunkId.value = null
    currentTime.value = 0
    duration.value = 0
    cleanupActiveStream()
    cleanupAudioQueuePlayback()
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
    volume,
    addToQueue,
    replaceQueue,
    createPlaceholder,
    fulfillChunk,
    updateChunkText,
    appendChunkText,
    startStreamChunk,
    appendStreamChunk,
    finishStreamChunk,
    markChunkError,
    removeChunk,
    seek,
    jumpToChunk,
    togglePlay,
    stop,
    clearQueue
  }
})
