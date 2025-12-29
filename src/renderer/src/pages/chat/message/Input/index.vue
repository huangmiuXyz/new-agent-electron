<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai'
import { useTerminal } from '@renderer/composables/useTerminal'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'

const message = ref('')
const chatStore = useChatsStores()
const selectedFiles = ref<Array<UploadFile>>([])

const {
  currentSelectedModel,
  selectedModelId,
  selectedProviderId,
  currentSelectedProvider,
  thinkingMode,
  display
} = storeToRefs(useSettingsStore())
const { updateThinkingMode } = useSettingsStore()
const { toggleTerminal } = useTerminal()

// 图标
const FileUploadIcon = useIcon('FileUpload')
const Bulb = useIcon('Bulb')
const TerminalIcon = useIcon('Terminal')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef('textareaRef')

// 处理文件选择
const handleFilesSelected = (files: Array<UploadFile>) => {
  selectedFiles.value.push(...files)
}

// 处理文件移除
const handleFileRemoved = (index: number) => {
  selectedFiles.value.splice(index, 1)
}

// 语音录制
const isRecording = ref(false)
const isListening = ref(false)
const isProcessingVoice = ref(false)

const { start: startVoice, stop: stopVoice, state: voiceState, isActive: voiceIsActive } = useContinuousVoiceRecorder({
  volumeThreshold: 0.02,
  silenceDuration: 800,
  onSpeechEnd: async (audio: Blob) => {
    isProcessingVoice.value = true
    try {
      console.log('语音录制完成:', audio)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } finally {
      isProcessingVoice.value = false
    }
  }
})

// 监听语音状态变化
watch(voiceState, (newState) => {
  isListening.value = newState === 'listening'
  isRecording.value = newState === 'recording'
})

// 切换语音录制
const toggleVoiceRecording = async () => {
  if (voiceIsActive.value) {
    stopVoice()
  } else {
    await startVoice()
  }
}

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const _sendMessage = async () => {
  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const input = message.value.trim()
  const hasContent = input || selectedFiles.value.length > 0

  if (hasContent) {
    message.value = ''
    if (chatStore.chats.length === 0) {
      chatStore.createChat()
    }
    const { sendMessages } = useChat(chatStore.currentChat!.id!)

    const parts: Array<FileUIPart | TextUIPart> = []

    if (input) {
      parts.push({ type: 'text', text: input })
    }

    selectedFiles.value.forEach((file) => {
      const { blobUrl, path, size, name, url, ...aiPart } = file
      parts.push({ ...aiPart, url: path ? path : url })
    })
    selectedFiles.value = []
    sendMessages(parts)
  }
}
</script>

<template>
  <footer class="footer">
    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />

      <textarea ref="textareaRef" class="input-field" rows="1"
        :placeholder="isProcessingVoice ? '正在处理语音...' : (currentSelectedModel?.name && currentSelectedProvider?.name ? `${currentSelectedProvider?.name}：${currentSelectedModel?.name}` : '请选择模型')"
        v-model="message" @input="adjustTextareaHeight" @keydown.enter.exact.prevent="_sendMessage"
        :disabled="isProcessingVoice"></textarea>

      <div class="input-actions">
        <div class="action-left">
          <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
            <FileUploadIcon />
          </Button>
          <!-- 思考模式按钮 -->
          <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
            @click="updateThinkingMode(!thinkingMode)" title="思考模式">
            <Bulb />
          </Button>

          <!-- 终端按钮 -->
          <Button variant="icon" size="sm" :class="{ 'terminal-active': display.showTerminal }" @click="toggleTerminal"
            title="显示终端">
            <TerminalIcon />
          </Button>

          <!-- 语音录制按钮 -->
          <Button variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }" @click="toggleVoiceRecording"
            :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'">
            <MicIcon v-if="!voiceIsActive" />
            <MicOffIcon v-else />
          </Button>

          <!-- 智能体选择器 -->
          <ChatAgentSelector type="icon" />
          <!-- 模型选择器 -->
          <ModelSelector type="icon" v-model:model-id="selectedModelId" v-model:provider-id="selectedProviderId" />
        </div>
        <Button variant="primary" size="md" @click="_sendMessage">发送</Button>
      </div>

      <!-- 拖拽提示 -->
      <div v-if="fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone" class="drag-overlay">
        <div class="drag-message">
          <FileUploadIcon />
          <span>释放以上传文件</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding: 10px;
  background: transparent;
}

.input-container {
  background: #fff;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  transition:
    border 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.input-container:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.input-container.drag-over {
  border-color: var(--primary-color, #007bff);
  background-color: rgba(0, 123, 255, 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 123, 255, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--primary-color, #007bff);
  font-weight: 500;
}

.drag-message svg {
  width: 32px;
  height: 32px;
}

.input-field {
  border: none;
  outline: none;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-family: var(--font-stack);
  resize: none;
  min-height: 24px;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
  background: transparent;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid #f5f5f5;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.thinking-active {
  color: var(--primary-color, #007bff);
  background-color: rgba(0, 123, 255, 0.1);
}

.terminal-active {
  color: var(--primary-color, #007bff);
  background-color: rgba(0, 123, 255, 0.1);
}

.voice-active {
  color: var(--primary-color, #007bff);
  background-color: rgba(0, 123, 255, 0.1);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}
</style>
