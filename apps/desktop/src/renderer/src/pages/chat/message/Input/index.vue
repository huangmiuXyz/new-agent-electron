<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai'
import { useTerminal } from '@renderer/composables/useTerminal'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'
// @ts-ignore
import { isText } from 'istextorbinary'

import { usePlugins } from '@renderer/composables/usePlugins'

const message = ref('')
const chatStore = useChatsStores()
const { triggerHook } = usePlugins()
const selectedFiles = ref<Array<UploadFile>>([])

const {
  currentSelectedModel,
  selectedModelId,
  selectedProviderId,
  currentSelectedProvider,
  thinkingMode,
  speechEnabled,
  display,
  defaultModels
} = storeToRefs(useSettingsStore())
const { updateThinkingMode, updateSpeechEnabled } = useSettingsStore()
const { toggleTerminal } = useTerminal()
const speechStore = useSpeechStore()
const agentStore = useAgentStore()

// 图标
const FileUploadIcon = useIcon('UploadOutlined')
const Bulb = useIcon('Bulb')
const TerminalIcon = useIcon('Terminal')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const CloseIcon = useIcon('Close')
const ClockIcon = useIcon('ClockCircle')

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef('textareaRef')

// 当前聊天的预发送消息列表
const pendingMessages = computed(() => {
  if (!chatStore.currentChat) return []
  return chatStore.getPendingMessages(chatStore.currentChat.id)
})

// 检查是否正在生成回复
const isGenerating = computed(() => {
  if (!chatStore.currentChat) return false
  return chatStore.isChatGenerating(chatStore.currentChat.id)
})

// 处理文件选择
const handleFilesSelected = (files: Array<UploadFile>) => {
  selectedFiles.value.push(...files)
}

// 处理文件移除
const handleFileRemoved = (index: number) => {
  selectedFiles.value.splice(index, 1)
}

// 移除预发送消息
const removePendingMessage = (messageId: string) => {
  if (!chatStore.currentChat) return
  chatStore.removePendingMessage(chatStore.currentChat.id, messageId)
}

// 获取预发送消息的文本预览
const getPendingMessagePreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const fileParts = parts.filter((p): p is FileUIPart => p.type === 'file')
  
  let preview = textParts.map(p => p.text).join(' ')
  if (fileParts.length > 0) {
    const fileText = fileParts.length === 1 ? '[文件]' : `[${fileParts.length}个文件]`
    preview = preview ? `${preview} ${fileText}` : fileText
  }
  
  // 截断显示
  if (preview.length > 50) {
    preview = preview.substring(0, 50) + '...'
  }
  return preview || '[空消息]'
}

// 语音录制
const isRecording = ref(false)
const isListening = ref(false)
const isProcessingVoice = ref(false)

const partialSpeechText = ref('')

const { start: startVoice, stop: stopVoice, state: voiceState, isActive: voiceIsActive } = useContinuousVoiceRecorder({
  volumeThreshold: 0.02,
  silenceDuration: 800,
  onData: (data: Float32Array) => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    triggerHook('speech.stream.data', { data, sampleRate })
  },
  onStart: async () => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    await triggerHook('speech.stream.start', {
      sampleRate,
      providerId: defaultModels.value.speechProviderId || selectedProviderId.value,
      onResult: (text: string) => {
        if (text) {
          message.value += (message.value ? ' ' : '') + text
          partialSpeechText.value = ''
          _sendMessage()
        }
      },
      onPartial: (text: string) => {
        partialSpeechText.value = text
      }
    })
  },
  onStop: async () => {
    try {
      await triggerHook('speech.stream.stop')
    } catch (error) {
      console.error('语音识别停止失败:', error)
    } finally {
      partialSpeechText.value = ''
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
    if (!defaultModels.value.speechModelId) {
      messageApi.error('请先在设置中选择默认语音转文字模型')
      return
    }
    await startVoice()
  }
}

const toggleSpeech = () => {
  const newState = !speechEnabled.value

  if (newState) {
    if (!defaultModels.value.ttsModelId) {
      messageApi.error('请先在设置中选择默认文字转语音模型')
      return
    }

    const voice = agentStore.selectedAgent?.speechVoice
    if (!voice) {
      messageApi.error('请先在智能体设置或默认设置中选择语音音色')
      return
    }
  }

  updateSpeechEnabled(newState)
  if (!newState) {
    speechStore.stop()
    speechStore.clearQueue()
  }
}

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const isComposing = ref(false)

const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

const handleEnterKey = () => {
  if (isComposing.value) {
    return
  }
  _sendMessage()
}

const _sendMessage = async () => {
  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const input = message.value.trim()
  const hasContent = input || selectedFiles.value.length > 0

  if (!hasContent) return

  // 构建消息parts
  const parts: Array<FileUIPart | TextUIPart> = []

  if (input) {
    parts.push({ type: 'text', text: input })
  }

  for (const file of selectedFiles.value) {
    const { path, name, url, ...aiPart } = file

    const res = await fetch(path ?? url!)
    const buffer = new Uint8Array(await res.arrayBuffer())

    if (isText(null, buffer)) {
      const text = new TextDecoder('utf-8').decode(buffer)
      parts.push({ type: 'text', text })
    }

    parts.push({
      ...aiPart,
      url: path ?? url
    } as FileUIPart)
  }

  // 清空输入
  message.value = ''
  selectedFiles.value = []
  nextTick(() => {
    adjustTextareaHeight({ target: textareaRef.value } as any)
  })

  // 确保有聊天会话
  if (chatStore.chats.length === 0) {
    chatStore.createChat()
  }

  const chatId = chatStore.currentChat!.id!
  const { sendMessages } = useChat(chatId)

  // 检查是否正在生成回复
  if (chatStore.isChatGenerating(chatId)) {
    // 添加到预发送队列
    chatStore.addPendingMessage(chatId, parts)
    messageApi.info('AI正在回复中，消息已进入预发送队列')
  } else {
    // 直接发送
    sendMessages(parts)
  }
}
</script>

<template>
  <footer class="footer" :class="{ 'is-centered': display.chatCenteredLayout }">
    <!-- 预发送消息列表 -->
    <div v-if="pendingMessages.length > 0" class="pending-messages-container">
      <div class="pending-messages-header">
        <ClockIcon class="pending-icon" />
        <span class="pending-title">预发送队列 ({{ pendingMessages.length }})</span>
        <span v-if="isGenerating" class="pending-status">等待AI回复中...</span>
      </div>
      <div class="pending-messages-list">
        <div v-for="item in pendingMessages" :key="item.id" class="pending-message-item">
          <span class="pending-message-text">{{ getPendingMessagePreview(item.parts) }}</span>
          <Button variant="icon" size="sm" class="remove-btn" @click="removePendingMessage(item.id)">
            <CloseIcon />
          </Button>
        </div>
      </div>
    </div>

    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />

      <div class="input-wrapper">
        <textarea ref="textareaRef" class="input-field" rows="1"
          :placeholder="isProcessingVoice ? '正在处理语音...' : (currentSelectedModel?.name && currentSelectedProvider?.name ? `${currentSelectedProvider?.name}：${currentSelectedModel?.name}` : '请选择模型')"
          v-model="message" @input="adjustTextareaHeight" @keydown.enter.exact.prevent="handleEnterKey"
          @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
          :disabled="isProcessingVoice"></textarea>
        <div v-if="partialSpeechText" class="partial-text">{{ partialSpeechText }}</div>
      </div>

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

          <!-- 文字转语音按钮 -->
          <Button variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }" @click="toggleSpeech"
            :title="speechEnabled ? '关闭语音播报' : '开启语音播报'">
            <VolumeIcon v-if="speechEnabled" />
            <VolumeMuteIcon v-else />
          </Button>

          <!-- 智能体选择器 -->
          <ChatAgentSelector type="icon" />
          <!-- 模型选择器 -->
          <ModelSelector type="icon" v-model:model-id="selectedModelId" v-model:provider-id="selectedProviderId" />
        </div>
        <Button variant="primary" size="md" @click="_sendMessage">
          {{ isGenerating && pendingMessages.length > 0 ? '加入队列' : '发送' }}
        </Button>
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
  width: 100%;
  transition: max-width 0.3s ease, margin 0.3s ease;
}

.footer.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

/* 预发送消息列表样式 */
.pending-messages-container {
  margin-bottom: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.pending-messages-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.pending-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.pending-title {
  font-weight: 500;
}

.pending-status {
  margin-left: auto;
  color: var(--text-tertiary);
  font-style: italic;
}

.pending-messages-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pending-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 0.2s;
}

.pending-message-item:hover {
  background: var(--bg-active);
}

.pending-message-text {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.remove-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-btn:hover {
  opacity: 1;
  color: var(--color-danger);
}

.input-container {
  background: var(--bg-input);
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
  border-color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
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
  color: var(--color-primary);
  font-weight: 500;
}

.drag-message svg {
  width: 32px;
  height: 32px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.partial-text {
  position: absolute;
  left: 8px;
  top: 8px;
  color: var(--text-tertiary);
  pointer-events: none;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  opacity: 0.7;
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
  color: var(--text-primary);
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border-color-light);
}

.action-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.thinking-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.terminal-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.voice-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
  animation: pulse 1.5s infinite;
}

.speech-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
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
