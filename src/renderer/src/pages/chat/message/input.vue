<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai';
import { useDropZone } from '@vueuse/core';

const message = ref('')
const chatStore = useChatsStores();
const selectedFiles = ref<Array<FileUIPart & { blobUrl: string; }>>([])
const FileInputRef = ref<HTMLInputElement>()
const inputContainerRef = ref<HTMLElement>()

const FileUpload = useIcon('FileUpload')

// 拖拽状态
const isDragOver = ref(false)

// 处理文件上传的通用函数
const processFiles = async (files: FileList | File[]) => {
  const fileArray = Array.from(files)
  const processedFiles = await Promise.all(
    fileArray.map(async f => ({
      url: await blobToDataURL(f),
      mediaType: f.type,
      blobUrl: URL.createObjectURL(f),
      filename: f.name,
      type: 'file' as const
    }))
  )

  selectedFiles.value.push(...processedFiles)
}

// 使用 useDropZone 处理拖拽上传
const { isOverDropZone } = useDropZone(inputContainerRef, {
  onDrop: (files) => {
    if (files && files.length > 0) {
      processFiles(files)
    }
    isDragOver.value = false
  },
  onEnter: () => {
    isDragOver.value = true
  },
  onLeave: () => {
    isDragOver.value = false
  }
})


// 监听粘贴事件
const handlePaste = async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items
  if (!items) return

  const files: File[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }

  if (files.length > 0) {
    event.preventDefault()
    await processFiles(files)
  }
}

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const { currentSelectedModel } = storeToRefs(useSettingsStore())

const handleUpload = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files) return

  await processFiles(files)
  FileInputRef.value!.value = ''
}

const removefile = (index: number) => {
  const file = selectedFiles.value[index]
  if (file.blobUrl) {
    URL.revokeObjectURL(file.blobUrl)
  }
  selectedFiles.value.splice(index, 1)
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
      const { blobUrl, ...aiPart } = file
      parts.push(aiPart)
    })

    selectedFiles.value = []
    sendMessages(parts)
  }
}
</script>

<template>
  <footer class="footer">
    <div ref="inputContainerRef" class="input-container" :class="{ 'drag-over': isDragOver || isOverDropZone }">
      <FilePreview removable v-if="selectedFiles.length > 0" :files="selectedFiles" preview-mode="input"
        @remove="removefile" />

      <textarea class="input-field" rows="1" placeholder="发送消息..." v-model="message" @input="adjustTextareaHeight"
        @keydown.enter.exact.prevent="_sendMessage" @paste="handlePaste"></textarea>

      <div class="input-actions">
        <div class="action-left">
          <input ref="FileInputRef" type="file" multiple @change="handleUpload" style="display: none;" />
          <Button variant="icon" size="sm" @click="FileInputRef?.click()">
            <FileUpload />
          </Button>

          <!-- 智能体选择器 -->
          <ChatAgentSelector />
          <!-- 模型选择器 -->
          <ChatModelSelector />
        </div>
        <Button variant="primary" size="md" @click="_sendMessage">发送</Button>
      </div>

      <!-- 拖拽提示 -->
      <div v-if="isDragOver || isOverDropZone" class="drag-overlay">
        <div class="drag-message">
          <FileUpload />
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
</style>