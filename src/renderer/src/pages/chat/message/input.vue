<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai';

const message = ref('')
const chatStore = useChatsStores();
const selectedImages = ref<Array<{ name: string; url: string; type: string }>>([])
const imageInputRef = ref<HTMLInputElement>()
const FileUpload = useIcon('FileUpload')
const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const { currentSelectedModel } = storeToRefs(useSettingsStore())

const handleImageUpload = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  if (!files) return

  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        selectedImages.value.push({
          name: file.name,
          url: result,
          type: file.type
        })
      }
      reader.readAsDataURL(file)
    }
  })
  if (imageInputRef.value) {
    imageInputRef.value.value = ''
  }
}

const removeImage = (index: number) => {
  selectedImages.value.splice(index, 1)
}

const _sendMessage = async () => {
  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const input = message.value.trim()
  const hasContent = input || selectedImages.value.length > 0

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

    selectedImages.value.forEach(image => {
      let mediaType = 'image/png'
      const imageData = image.url

      if (imageData.startsWith('data:')) {
        const match = imageData.match(/^data:([^;]+);/)
        if (match && match[1]) {
          mediaType = match[1]
        }
      }

      parts.push({
        type: 'file',
        url: imageData,
        mediaType,
        filename: image.name
      })
    })

    selectedImages.value = []

    sendMessages(parts)
  }
}
</script>

<template>
  <footer class="footer">
    <div class="input-container">
      <!-- 图片预览区域 -->
      <div v-if="selectedImages.length > 0" class="image-preview-container">
        <div v-for="(image, index) in selectedImages" :key="index" class="image-preview-item">
          <img :src="image.url" :alt="image.name" class="preview-image" />
          <button class="remove-image-btn" @click="removeImage(index)">×</button>
        </div>
      </div>

      <textarea class="input-field" rows="1" placeholder="发送消息..." v-model="message" @input="adjustTextareaHeight"
        @keydown.enter.exact.prevent="_sendMessage"></textarea>
      <div class="input-actions">
        <div class="action-left">
          <input ref="imageInputRef" type="file" accept="image/*" multiple @change="handleImageUpload"
            style="display: none;" />
          <Button variant="icon" size="sm" @click="imageInputRef?.click()">
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
/* === 底部输入区域：悬浮式设计 === */
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
  /* 高级感的悬浮阴影 */
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

.action-group {
  display: flex;
  gap: 12px;
}

/* 图片预览样式 */
.image-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
  margin-bottom: 8px;
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-image-btn {
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
}

.remove-image-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}
</style>
