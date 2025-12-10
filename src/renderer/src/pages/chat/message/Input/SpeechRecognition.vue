<script setup lang="ts">
import { useSpeechRecognition } from '@vueuse/core';

// 定义组件的事件
const emit = defineEmits<{
    speechResult: [text: string]
    speechStart: []
    speechEnd: []
}>()

// 语音识别相关状态
const isListening = ref(false)
const speechTimeout = ref<NodeJS.Timeout | null>(null)
const speechBuffer = ref('')

// 图标
const MicIcon = useIcon('Play')
const StopIcon = useIcon('Stop')

// 语音识别配置
const {
    isSupported,
    isListening: speechIsListening,
    isFinal,
    result,
    start,
    stop,
    error
} = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    lang: 'zh-CN'
})

// 监听语音识别结果
watch(result, (newResult) => {
    if (newResult && newResult.trim()) {
        speechBuffer.value += newResult

        // 如果是最终结果，设置一个定时器在用户停止说话后自动发送
        if (isFinal.value) {
            resetSpeechTimeout()
        }
    }
})

// 监听语音识别状态变化
watch(speechIsListening, (listening) => {
    isListening.value = listening
    if (listening) {
        emit('speechStart')
    } else {
        emit('speechEnd')
    }
})

// 重置语音超时定时器
const resetSpeechTimeout = () => {
    if (speechTimeout.value) {
        clearTimeout(speechTimeout.value)
    }

    // 2秒后自动发送语音内容
    speechTimeout.value = setTimeout(() => {
        sendSpeechMessage()
    }, 2000)
}

// 发送语音消息
const sendSpeechMessage = async () => {
    if (speechTimeout.value) {
        clearTimeout(speechTimeout.value)
        speechTimeout.value = null
    }

    const speechText = speechBuffer.value.trim()
    if (speechText) {
        emit('speechResult', speechText)
        speechBuffer.value = ''
    }
}

// 切换语音识别状态
const toggleSpeechRecognition = () => {
    if (!isSupported.value) {
        messageApi.error('您的浏览器不支持语音识别功能')
        return
    }

    if (isListening.value) {
        stop()
        if (speechTimeout.value) {
            clearTimeout(speechTimeout.value)
            speechTimeout.value = null
        }
        // 如果有缓冲内容，立即发送
        if (speechBuffer.value.trim()) {
            sendSpeechMessage()
        }
    } else {
        speechBuffer.value = ''
        start()
    }
}

// 暴露给父组件的方法和状态
defineExpose({
    isListening,
    speechBuffer,
    toggleSpeechRecognition
})
</script>

<template>
    <div class="speech-recognition">
        <!-- 语音识别按钮 -->
        <Button variant="icon" size="sm" @click="toggleSpeechRecognition" :class="{ 'voice-active': isListening }"
            :title="isListening ? '停止语音识别' : '开始语音识别'">
            <component :is="isListening ? StopIcon : MicIcon" />
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