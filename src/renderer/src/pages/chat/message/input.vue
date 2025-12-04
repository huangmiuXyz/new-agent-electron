<script setup lang="ts">
const message = ref('')
const selectedImages = ref<Array<{ file: File; preview: string }>>([])
const chatStore = useChatsStores();

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const { sendMessages } = useChat()

// 处理图片选择
const handleImageSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  if (!files) return

  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        selectedImages.value.push({
          file,
          preview: e.target?.result as string
        })
      }
      reader.readAsDataURL(file)
    }
  })
}

// 移除选中的图片
const removeImage = (index: number) => {
  selectedImages.value.splice(index, 1)
}

// 发送消息（包含图片）
const _sendMessage = async () => {
  const input = message.value.trim()
  const hasImages = selectedImages.value.length > 0

  if (input || hasImages) {
    if (chatStore.chats.length === 0) {
      chatStore.createChat()
    }

    // 准备消息内容
    const messageParts: Array<{ type: string; text?: string; image?: Uint8Array }> = []

    // 添加文本内容
    if (input) {
      messageParts.push({ type: 'text', text: input })
    }

    // 添加图片内容
    for (const img of selectedImages.value) {
      const arrayBuffer = await img.file.arrayBuffer()
      messageParts.push({
        type: 'image',
        image: new Uint8Array(arrayBuffer)
      })
    }

    // 发送消息
    await sendMessages(messageParts, chatStore.currentChat!.id!)

    // 清空输入
    message.value = ''
    selectedImages.value = []
  }
}
</script>

<template>
  <footer class="footer">
    <!-- 图片预览区域 -->
    <div v-if="selectedImages.length > 0" class="image-preview-container">
      <div class="image-preview-list">
        <div v-for="(img, index) in selectedImages" :key="index" class="image-preview-item">
          <img :src="img.preview" alt="Preview" class="preview-image" />
          <button class="remove-image-btn" @click="removeImage(index)">×</button>
        </div>
      </div>
    </div>

    <div class="input-container">
      <textarea class="input-field" rows="1" placeholder="发送消息..." v-model="message" @input="adjustTextareaHeight"
        @keydown.enter.exact.prevent="_sendMessage"></textarea>
      <div class="input-actions">
        <div class="action-left">
          <!-- 图片上传按钮 -->
          <div class="image-upload-wrapper">
            <input type="file" id="image-upload" accept="image/*" multiple @change="handleImageSelect"
              class="image-upload-input" />
            <label for="image-upload" class="image-upload-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </label>
          </div>
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

/* 图片预览区域 */
.image-preview-container {
  margin-bottom: 10px;
  padding: 0 10px;
}

.image-preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: #f9f9f9;
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
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.remove-image-btn:hover {
  background: rgba(0, 0, 0, 0.8);
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

/* 图片上传按钮样式 */
.image-upload-wrapper {
  position: relative;
}

.image-upload-input {
  display: none;
}

.image-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.image-upload-btn:hover {
  background: #e8e8e8;
  color: #333;
  border-color: #d0d0d0;
}
</style>
