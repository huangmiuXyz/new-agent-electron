<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai';
const message = ref('')
const chatStore = useChatsStores();
const selectedFiles = ref<Array<FileUIPart & { blobUrl: string; name: string }>>([])
const FileInputRef = ref<HTMLInputElement>()

const FileUpload = useIcon('FileUpload')

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
      <FilePreview removable v-if="selectedFiles.length > 0" :files="selectedFiles" preview-mode="input"
        @remove="removefile" />

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
</style>