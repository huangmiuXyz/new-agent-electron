<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai';

const message = ref('')
const chatStore = useChatsStores();
const selectedFiles = ref<Array<FileUIPart & { blobUrl: string; name: string }>>([])
const FileInputRef = ref<HTMLInputElement>()

const FileUpload = useIcon('FileUpload')
const FileIcon = useIcon('FileText')

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const { currentSelectedModel } = storeToRefs(useSettingsStore())

const handleUpload = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files) return

  const imgs = await Promise.all(
    [...files].map(async f =>
    ({
      url: await blobToDataURL(f),
      mediaType: f.type,
      blobUrl: URL.createObjectURL(f),
      name: f.name, // 3. 保存文件名
      type: 'file' as const
    }))
  )

  selectedFiles.value.push(...imgs)
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
      const { blobUrl, name, ...aiPart } = file
      parts.push(aiPart)
    })

    selectedFiles.value = []
    sendMessages(parts)
  }
}
</script>

<template>
  <footer class="footer">
    <div class="input-container">
      <div v-if="selectedFiles.length > 0" class="file-preview-container">
        <div v-for="(file, index) in selectedFiles" :key="index" class="file-preview-item">

          <img v-if="file.mediaType.startsWith('image/')" :src="file.blobUrl || file.url" class="preview-file"
            :alt="file.name" />

          <div v-else class="preview-generic">
            <div class="generic-icon">
              <component :is="FileIcon" v-if="FileIcon" />
              <span v-else>📄</span>
            </div>
            <span class="file-name" :title="file.name">{{ file.name }}</span>
          </div>

          <button class="remove-file-btn" @click="removefile(index)">×</button>
        </div>
      </div>

      <textarea class="input-field" rows="1" placeholder="发送消息..." v-model="message" @input="adjustTextareaHeight"
        @keydown.enter.exact.prevent="_sendMessage"></textarea>

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
}

.input-container:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
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
  gap: 12px;
}

.file-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  padding-top: 0;
  border-bottom: 1px solid #f5f5f5;
  margin-bottom: 8px;
}

.file-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
}

.preview-file {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-generic {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
}

.generic-icon {
  font-size: 24px;
  color: #6b7280;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-name {
  font-size: 10px;
  color: #374151;
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 2px;
}

.remove-file-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  transition: background 0.2s;
  z-index: 10;
}

.remove-file-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}
</style>