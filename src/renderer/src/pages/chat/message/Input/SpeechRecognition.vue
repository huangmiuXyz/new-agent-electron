<script setup lang="ts">
import { createModel, Model, KaldiRecognizer } from "vosk-browser"

const emit = defineEmits<{
    speechResult: [text: string]
    speechStart: []
    speechEnd: []
}>()

const { Mic16Filled, Stop } = useIcon(['Stop', 'Mic16Filled'])

const isListening = ref(false)
const speechBuffer = ref('')
const speechTimeout = ref<NodeJS.Timeout | null>(null)

// Vosk 内部变量
let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let model: Model | null = null
let recognizer: KaldiRecognizer | null = null
let stream: MediaStream | null = null

async function initVoskModel() {
    if (model) return

    model = await createModel("/models/vosk-model-small-cn-0.22.zip")
    recognizer = new model.KaldiRecognizer(16000)
    recognizer.setWords(true)

    // 监听部分识别结果
    recognizer.on("partialresult", (msg) => {
        if (msg.event === "partialresult") {
            speechBuffer.value += msg.result.partial
            resetSpeechTimeout()
        }
    })

    // 监听完整识别结果
    recognizer.on("result", (msg) => {
        if (msg.event === "result") {
            speechBuffer.value = msg.result.text
            resetSpeechTimeout()
        }
    })
}

async function startMic() {
    if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: 16000 })
        await audioContext.audioWorklet.addModule("/worklet/vosk-processor.js")
    }

    workletNode = new AudioWorkletNode(audioContext, "vosk-processor")

    // 收录音数据后送入识别器
    workletNode.port.onmessage = (event) => {
        const floatData = event.data as Float32Array
        recognizer?.acceptWaveformFloat(floatData, audioContext!.sampleRate)
    }

    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(workletNode)
}

function stopMic() {
    // 断开 WorkletNode
    if (workletNode) {
        try {
            workletNode.disconnect()
        } catch (e) { }
        workletNode = null
    }

    // 停止所有录音轨
    if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        stream = null
    }

    // 关闭 audioContext
    if (audioContext) {
        try {
            audioContext.close()
        } catch (e) { }
        audioContext = null
    }
}

function resetSpeechTimeout() {
    if (speechTimeout.value) {
        clearTimeout(speechTimeout.value)
    }
    speechTimeout.value = setTimeout(() => sendSpeechMessage(), 1500)
}

function sendSpeechMessage() {
    if (!speechBuffer.value.trim()) return
    emit("speechResult", speechBuffer.value.trim())
    speechBuffer.value = ''
}

async function toggleSpeechRecognition() {
    if (isListening.value) {
        // STOP
        isListening.value = false
        emit("speechEnd")
        sendSpeechMessage()
        stopMic()
        return
    }

    // START
    isListening.value = true
    emit("speechStart")

    await initVoskModel()
    await startMic()
}

defineExpose({
    isListening,
    speechBuffer,
    toggleSpeechRecognition
})
</script>

<template>
    <div class="speech-recognition">
        <Button variant="icon" size="sm" @click="toggleSpeechRecognition" :class="{ 'voice-active': isListening }"
            :title="isListening ? '停止语音识别' : '开始语音识别'">
            <component :is="isListening ? Stop : Mic16Filled" />
        </Button>
    </div>
</template>

<style scoped>
.voice-active {
    color: #ff4757 !important;
    background-color: rgba(255, 71, 87, 0.1) !important;
}

.voice-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-top: 8px;
    background-color: rgba(255, 71, 87, 0.05);
    border-radius: 8px;
    font-size: 14px;
    color: #666;
}

.voice-indicator {
    width: 8px;
    height: 8px;
    background-color: #ff4757;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
}

.voice-text {
    font-weight: 500;
}

.voice-preview {
    color: #333;
    font-style: italic;
    margin-left: auto;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@keyframes pulse {
    0% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.5;
        transform: scale(1.2);
    }

    100% {
        opacity: 1;
        transform: scale(1);
    }
}
</style>
