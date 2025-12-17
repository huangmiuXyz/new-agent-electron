<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai';

const message = ref('')
const chatStore = useChatsStores();
const selectedFiles = ref<Array<UploadFile>>([])

const { currentSelectedModel, selectedModelId, selectedProviderId, currentSelectedProvider, thinkingMode } = storeToRefs(useSettingsStore())
const { updateThinkingMode } = useSettingsStore()

// 图标
const FileUploadIcon = useIcon('FileUpload')
const Thinking20Filled = useIcon('Thinking20Filled')

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const speechRecognitionRef = useTemplateRef('speechRecognitionRef')
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

// 处理语音识别结果
const handleSpeechResult = async (text: string) => {
  message.value = text
  await _sendMessage()
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

    selectedFiles.value.forEach(file => {
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
        :placeholder="`发送消息给${currentSelectedProvider?.name}提供的${currentSelectedModel?.name}...`" v-model="message"
        @input="adjustTextareaHeight" @keydown.enter.exact.prevent="_sendMessage"></textarea>

      <div class="input-actions">
        <div class="action-left">
          <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
            <FileUploadIcon />
          </Button>
          <!-- 语音识别组件 -->
          <ChatMessageInputSpeechRecognition ref="speechRecognitionRef" @speech-result="handleSpeechResult" />

          <!-- 思考模式按钮 -->
          <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
            @click="updateThinkingMode(!thinkingMode)" title="思考模式">
            <Thinking20Filled />
          </Button>

          <!-- 智能体选择器 -->
          <ChatAgentSelector type="icon" />
          <!-- 模型选择器 -->
          <ModelSelector type="icon" v-model:model-id="selectedModelId" v-model:provider-id="selectedProviderId" />
        </div>
        <Button variant="primary" size="md" @click="_sendMessage">发送</Button>
      </div>

      <!-- 语音识别状态显示 -->
      <div v-if="speechRecognitionRef?.isListening" class="voice-status">
        <div class="voice-indicator"></div>
        <span class="voice-text">正在听取语音...</span>
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
  transition: border 0.2s, box-shadow 0.2s;
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
  font-size: 14px;
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

.thinking-active {
  color: var(--primary-color, #007bff);
  background-color: rgba(0, 123, 255, 0.1);
}
</style>