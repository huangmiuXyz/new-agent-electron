import { onUnmounted, ref } from 'vue'

export type InputAudioRecorderMode = 'manual' | 'continuous'
export type InputAudioRecorderState = 'idle' | 'listening' | 'recording' | 'processing'

export interface InputAudioItem {
  id: string
  filename: string
  mediaType: 'audio/wav' | 'audio/mpeg'
  dataUrl: string
  blobUrl: string
  size: number
  duration: number
  createdAt: number
}

interface UseInputAudioRecorderOptions {
  volumeThreshold?: number
  silenceDuration?: number
  onAutoAudio?: (audio: InputAudioItem) => Promise<void> | void
}

const createAudioId = () =>
  `input-audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const audioBufferToWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
  const bytesPerSample = 2
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + samples.length * bytesPerSample)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)

  let offset = headerSize
  for (let i = 0; i < samples.length; i += 1, offset += bytesPerSample) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取音频失败'))
    reader.readAsDataURL(blob)
  })

const mergeSamples = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })
  return merged
}

const calculateVolume = (samples: Float32Array) => {
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / Math.max(samples.length, 1))
}

export function useInputAudioRecorder(options: UseInputAudioRecorderOptions = {}) {
  const { volumeThreshold = 0.018, silenceDuration = 1000, onAutoAudio } = options

  const state = ref<InputAudioRecorderState>('idle')
  const mode = ref<InputAudioRecorderMode>('manual')
  const isActive = ref(false)
  const level = ref(0)

  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let chunks: Float32Array[] = []
  let recordingStartedAt = 0
  let silenceStartedAt = 0
  let processingAudio = false

  const resetChunks = () => {
    chunks = []
    recordingStartedAt = 0
    silenceStartedAt = 0
  }

  const buildAudioItem = async (): Promise<InputAudioItem | null> => {
    if (!audioContext || chunks.length === 0) return null

    const samples = mergeSamples(chunks)
    if (samples.length === 0) return null

    const duration = samples.length / audioContext.sampleRate
    if (duration < 0.15) return null

    const blob = audioBufferToWavBlob(samples, audioContext.sampleRate)
    const dataUrl = await blobToDataUrl(blob)
    const id = createAudioId()

    return {
      id,
      filename: `${id}.wav`,
      mediaType: 'audio/wav',
      dataUrl,
      blobUrl: URL.createObjectURL(blob),
      size: blob.size,
      duration,
      createdAt: Date.now()
    }
  }

  const finishCurrentRecording = async () => {
    if (processingAudio) return null
    processingAudio = true
    state.value = 'processing'

    try {
      return await buildAudioItem()
    } finally {
      resetChunks()
      processingAudio = false
      state.value = mode.value === 'continuous' && isActive.value ? 'listening' : 'idle'
    }
  }

  const stopStream = () => {
    processor?.disconnect()
    source?.disconnect()
    stream?.getTracks().forEach((track) => track.stop())
    void audioContext?.close()

    processor = null
    source = null
    stream = null
    audioContext = null
    isActive.value = false
    level.value = 0
  }

  const ensureStream = async () => {
    if (isActive.value && audioContext && processor) return

    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    source = audioContext.createMediaStreamSource(stream)
    processor = audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      if (!isActive.value || processingAudio) return

      const input = event.inputBuffer.getChannelData(0)
      const sample = new Float32Array(input)
      const volume = calculateVolume(sample)
      level.value = volume

      if (mode.value === 'manual') {
        if (state.value === 'recording') {
          chunks.push(sample)
        }
        return
      }

      const now = performance.now()
      if (volume > volumeThreshold) {
        if (state.value === 'listening') {
          resetChunks()
          recordingStartedAt = now
          state.value = 'recording'
        }
        silenceStartedAt = 0
        chunks.push(sample)
        return
      }

      if (state.value === 'recording') {
        chunks.push(sample)
        if (!silenceStartedAt) {
          silenceStartedAt = now
        }
        if (now - silenceStartedAt >= silenceDuration && now - recordingStartedAt > 250) {
          void finishCurrentRecording().then((audio) => {
            if (audio) {
              void onAutoAudio?.(audio)
            }
          })
        }
      }
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
    isActive.value = true
  }

  const startManual = async () => {
    mode.value = 'manual'
    await ensureStream()
    resetChunks()
    state.value = 'recording'
    recordingStartedAt = performance.now()
  }

  const stopManual = async () => {
    if (mode.value !== 'manual' || state.value !== 'recording') return null
    const audio = await finishCurrentRecording()
    stopStream()
    return audio
  }

  const startContinuous = async () => {
    mode.value = 'continuous'
    await ensureStream()
    resetChunks()
    state.value = 'listening'
  }

  const stopContinuous = () => {
    resetChunks()
    state.value = 'idle'
    stopStream()
  }

  const stop = () => {
    resetChunks()
    state.value = 'idle'
    stopStream()
  }

  onUnmounted(stop)

  return {
    state,
    mode,
    isActive,
    level,
    startManual,
    stopManual,
    startContinuous,
    stopContinuous,
    stop
  }
}
