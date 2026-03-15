<script setup lang="ts">
import { blobToDataURL } from 'blob-util'
import FileUpload from '@renderer/components/FileUpload.vue'
import { usePromptOptimize } from '@renderer/composables/usePromptOptimize'

const props = defineProps<{
  isModelSelected: boolean
  showReferenceUpload?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'update:input', value: string): void
}>()

const inputText = defineModel<string>('input', { default: '' })

const { isOptimizing, optimizeModelId, optimizeProviderId, optimizePrompt, handleOptimizeModelChange } = usePromptOptimize()

// 参考图片
const referenceImages = ref<string[]>([])
const dropZoneRef = ref<HTMLElement>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 使用 useUpload
const { triggerUpload, isDragOver, isOverDropZone } = useUpload({
  dropZoneRef,
  inputRef: textareaRef as Ref<HTMLTextAreaElement | undefined>,
  onFilesSelected: async (files) => {
    for (const file of files) {
      if (file.blobUrl) {
        const response = await fetch(file.blobUrl)
        const blob = await response.blob()
        const base64 = await blobToDataURL(blob)
        referenceImages.value.push(base64)
      }
    }
  }
})

const handleAddReferenceImage = () => {
  triggerUpload(true)
}

const removeReferenceImage = (index: number) => {
  referenceImages.value.splice(index, 1)
}

const handleInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = '44px'
    const scrollHeight = textareaRef.value.scrollHeight
    if (scrollHeight > 44) {
      textareaRef.value.style.height = `${scrollHeight}px`
    }
  }
}

watch(inputText, () => {
  nextTick(handleInput)
})

const handleOptimize = async () => {
  await optimizePrompt(inputText.value, {
    onProgress: (text) => {
      inputText.value = text
      nextTick(handleInput)
    }
  })
}

const handleSubmit = () => {
  emit('submit')
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

const clearInput = () => {
  inputText.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = '44px'
  }
}

// 暴露方法给父组件
defineExpose({
  referenceImages,
  clearInput,
  clearReferenceImages: () => {
    referenceImages.value = []
  }
})

const { Plus, Send, X, Bulb } = useIcon(['Plus', 'Send', 'X', 'Bulb'])
</script>

<template>
  <div class="floating-input-area">
    <Card
      ref="dropZoneRef"
      class="input-box-wrapper"
      :class="{ disabled: !isModelSelected, 'drag-over': isDragOver || isOverDropZone }"
      radius="24px"
      padding="8px 16px"
    >
      <!-- 参考图片预览 -->
      <div v-if="props.showReferenceUpload !== false && referenceImages.length > 0" class="reference-images-section">
        <FileUpload
          v-model="referenceImages"
          :multiple="true"
          :removable="true"
          :show-upload="true"
          @remove="removeReferenceImage"
        />
      </div>

      <div class="input-top">
        <div class="textarea-wrapper">
          <Button
            v-if="props.showReferenceUpload !== false"
            variant="text"
            size="sm"
            class="reference-image-btn"
            title="添加参考图片"
            :disabled="!isModelSelected"
            @click="handleAddReferenceImage"
          >
            <Plus />
          </Button>
          <textarea
            ref="textareaRef"
            :value="inputText"
            :placeholder="isModelSelected ? '说说今天想做点什么' : '请先选择生成模型'"
            :disabled="!isModelSelected || isOptimizing"
            rows="1"
            @input="inputText = ($event.target as HTMLTextAreaElement).value"
            @keydown="handleKeyDown"
          ></textarea>
          <Button
            v-if="inputText && !isOptimizing"
            variant="text"
            size="sm"
            class="clear-btn"
            @click="clearInput"
          >
            <X />
          </Button>
        </div>

        <div class="input-actions">
          <ModelSelector
            v-model:modelId="optimizeModelId"
            v-model:providerId="optimizeProviderId"
            popup-position="top"
            type="icon"
            category="text"
            class="optimize-model-selector"
            @update:model-id="(id) => handleOptimizeModelChange({ modelId: id, providerId: optimizeProviderId })"
            @update:provider-id="(id) => handleOptimizeModelChange({ modelId: optimizeModelId, providerId: id })"
          />
          <Button
            v-if="inputText || isOptimizing"
            variant="text"
            size="sm"
            class="optimize-btn"
            title="优化提示词"
            :loading="isOptimizing"
            @click="handleOptimize"
          >
            <Bulb />
          </Button>
          <Button
            variant="primary"
            size="sm"
            class="send-btn"
            :disabled="!isModelSelected || !inputText.trim() || isOptimizing"
            @click="handleSubmit"
          >
            <template #icon>
              <Send style="font-size: 13px" />
            </template>
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.floating-input-area {
  z-index: 2;
  padding: 24px 40px 40px;
  display: flex;
  justify-content: center;
  position: absolute;
  bottom: 0;
  width: 100%;
  left: 0;
  background: linear-gradient(to top, var(--bg-secondary) 30%, transparent);
  pointer-events: none;
}

.input-box-wrapper {
  width: 100%;
  max-width: 800px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--bg-card) !important;
  border: 1px solid var(--border-subtle) !important;
  pointer-events: auto;
  overflow: visible !important;
}

.input-box-wrapper:focus-within {
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.input-box-wrapper.disabled {
  background: var(--bg-secondary) !important;
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.input-box-wrapper.drag-over {
  border-color: var(--accent-color) !important;
  background: rgba(var(--accent-rgb), 0.05) !important;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.2), 0 16px 48px rgba(0, 0, 0, 0.2) !important;
}

.input-box-wrapper.disabled textarea {
  cursor: not-allowed;
}

.input-top {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.textarea-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.textarea-wrapper textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  padding: 10px 32px 10px 4px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  outline: none;
  min-height: 44px;
  max-height: 200px;
  display: flex;
  align-items: center;
  overflow-y: auto;
}

.textarea-wrapper .clear-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.textarea-wrapper .reference-image-btn {
  flex-shrink: 0;
  color: var(--text-tertiary) !important;
  opacity: 0.6;
  transition: all 0.2s;
}

.textarea-wrapper .reference-image-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--bg-hover) !important;
  color: var(--accent-color) !important;
}

.textarea-wrapper .reference-image-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.input-top textarea::placeholder {
  color: var(--text-tertiary);
}

.input-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 6px;
  position: relative;
  z-index: 10;
}

.clear-btn,
.optimize-btn,
.optimize-model-selector {
  color: var(--text-tertiary) !important;
  opacity: 0.6;
  transition: all 0.2s;
}

.clear-btn:hover,
.optimize-btn:hover,
.optimize-model-selector:hover {
  opacity: 1;
  background: var(--bg-hover) !important;
  color: var(--accent-color) !important;
}

.optimize-model-selector {
  margin-right: -4px;
}

.reference-image-btn {
  color: var(--text-tertiary) !important;
  opacity: 0.6;
  transition: all 0.2s;
}

.reference-image-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--bg-hover) !important;
  color: var(--accent-color) !important;
}

.reference-image-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.reference-images-section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
}

.optimize-model-selector:hover {
  background: transparent !important;
}

:deep(.optimize-model-selector button) {
  padding: 4px !important;
  height: 28px !important;
  width: 28px !important;
  border: none !important;
  background: transparent !important;
  border-radius: 8px !important;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.optimize-model-selector button:hover) {
  background: var(--bg-hover) !important;
  color: var(--accent-color) !important;
}

.optimize-btn:hover {
  color: #f1c40f !important;
}

.send-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50% !important;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
  transition: all 0.2s;
}

.send-btn:not(:disabled):hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(var(--accent-rgb), 0.4);
}

.send-btn:disabled {
  background: var(--bg-secondary) !important;
  color: var(--text-disabled) !important;
  box-shadow: none;
}
</style>
