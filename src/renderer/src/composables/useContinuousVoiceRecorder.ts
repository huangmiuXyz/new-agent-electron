import { ref, onUnmounted } from 'vue'

type RecorderState = 'listening' | 'recording' | 'callback' | 'end'

interface UseContinuousVoiceRecorderOptions {
  volumeThreshold?: number
  silenceDuration?: number
  onSpeechEnd: (audio: Blob) => Promise<void> | void
  onData?: (data: Float32Array) => void
}

export function useContinuousVoiceRecorder(options: UseContinuousVoiceRecorderOptions) {
  const { volumeThreshold = 0.02, silenceDuration = 800, onSpeechEnd } = options

  const state = ref<RecorderState>('listening')
  const isActive = ref(false)

  let stream: MediaStream
  let audioContext: AudioContext
  let analyser: AnalyserNode
  let source: MediaStreamAudioSourceNode
  let processor: ScriptProcessorNode
  let mediaRecorder: MediaRecorder

  let chunks: BlobPart[] = []
  let silenceTimer: number | null = null
  const buffer = new Uint8Array(1024)

  function getVolume() {
    analyser.getByteTimeDomainData(buffer)
    let sum = 0
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / buffer.length)
  }

  async function loop() {
    if (!isActive.value) return

    if (state.value !== 'listening' && state.value !== 'recording') {
      requestAnimationFrame(loop)
      return
    }

    const volume = getVolume()

    if (volume > volumeThreshold) {
      if (state.value === 'listening') {
        state.value = 'recording'
        chunks = []
        mediaRecorder.start()
      }

      if (silenceTimer) {
        clearTimeout(silenceTimer)
        silenceTimer = null
      }
    } else if (state.value === 'recording' && !silenceTimer) {
      silenceTimer = window.setTimeout(() => {
        silenceTimer = null
        state.value = 'callback'
        mediaRecorder.stop()
      }, silenceDuration)
    }

    requestAnimationFrame(loop)
  }

  function setupRecorder() {
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data)

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })

      try {
        await onSpeechEnd(blob)
      } finally {
        chunks = []
        state.value = 'listening'
      }
    }
  }

  async function start() {
    if (isActive.value) return

    stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    audioContext = new AudioContext()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048

    source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    // Set up real-time data processing
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      if (state.value === 'recording' && options.onData) {
        const inputData = e.inputBuffer.getChannelData(0)
        // Pass a copy to avoid issues with buffer reuse
        options.onData(new Float32Array(inputData))
      }
    }
    source.connect(processor)
    processor.connect(audioContext.destination)

    mediaRecorder = new MediaRecorder(stream)
    setupRecorder()

    isActive.value = true
    state.value = 'listening'

    loop()
  }

  function stop() {
    isActive.value = false
    state.value = 'end'
    silenceTimer && clearTimeout(silenceTimer)
    stream?.getTracks().forEach((t) => t.stop())
    processor?.disconnect()
    source?.disconnect()
    audioContext?.close()
  }

  onUnmounted(stop)

  return {
    start,
    stop,
    state,
    isActive
  }
}
