<script setup lang="tsx">
import { ImageGenerateOptions } from '@renderer/services/chatService';
import { createRegistry } from '@renderer/services/chatService/registry';
import { useSettingsStore } from '@renderer/stores/settings'
import { FormField } from '@renderer/composables/useForm'
import { ImageBatch, useImageStore } from '@renderer/stores/image'

const service = chatService()
const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const { generatedBatches } = storeToRefs(imgStore)

const getDynamicImageFields = (providerId: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  if (!providerInstance || !providerInstance.imageCallOptionsSchema) return null

  const fields = zodSchemasToFormfields(
    providerInstance.imageCallOptionsSchema,
    `providerOptions.${provider.providerType}`
  )

  if (fields.length === 0) return null

  return {
    name: `providerOptions.${provider.providerType}`,
    type: 'group',
    label: '更多设置',
    collapsible: true,
    defaultCollapsed: false,
    children: fields,
    noStyle: true
  } as FormField<any>
}

const dynamicField = ref<FormField<any> | null>(null)

const baseFields = [
  {
    name: 'model',
    type: 'modelSelector',
    popupPosition: 'bottom',
    label: '生成模型',
    modelCategory: 'image',
    required: true,
    onChange: ({ providerId }) => {
      dynamicField.value = getDynamicImageFields(providerId)
    }
  },
  {
    name: 'size',
    type: 'select',
    label: '图像尺寸',
    options: [
      { label: '1024x1024', value: '1024x1024' },
      { label: '512x512', value: '512x512' },
      { label: '256x256', value: '256x256' },
      { label: '1024x1792', value: '1024x1792' },
      { label: '1792x1024', value: '1792x1024' }
    ],
    defaultValue: '1024x1024'
  },
  {
    name: 'n',
    type: 'slider',
    label: '生成数量',
    min: 1,
    max: 4,
    step: 1,
    defaultValue: 1
  },
  {
    name: 'seed',
    label: '随机种子',
    placeholder: '留空则随机生成...',
    type: 'number',
    rest: () => (
      <Button
        variant="text"
        size="sm"
        onClick={() => {
          const randomSeed = Math.floor(Math.random() * 1000000)
          formActions.setFieldValue('seed', randomSeed)
        }}
      >
        {Dices}
      </Button>
    )
  }
]

const allFields = computed<FormField<any>[]>(() => {
  const fields = [...baseFields] as FormField<any>[]
  if (dynamicField.value) {
    fields.push(dynamicField.value)
  }
  return fields
})

const rightInput = ref('')
const resultsContainer = ref<HTMLElement | null>(null)

const isModelSelected = computed(() => {
  return !!settingsStore.imageGenerationForm.model?.modelId
})

const scrollToBottom = () => {
  nextTick(() => {
    if (resultsContainer.value) {
      resultsContainer.value.scrollTop = resultsContainer.value.scrollHeight
    }
  })
}

const [ImageForm, formActions] = useForm<ImageGenerateOptions & {
  model: { modelId: string, providerId: string },
  prompt: string,
  providerOptions?: Record<string, any>
}>({
  fields: allFields,
  initialData: settingsStore.imageGenerationForm,
  onChange: (_field, _value, data) => {
    settingsStore.updateImageGenerationForm(data)
  },
  onSubmit: async (data) => {
    const prompt = data.prompt || rightInput.value.trim()
    if (!prompt) {
      return
    }

    const n = data.n || 1
    const batchId = Date.now()
    const currentPlaceholders = Array(n).fill(null).map((_, i) => ({
      loading: true,
      id: batchId + i
    }))

    const newBatch: ImageBatch = {
      id: batchId,
      prompt: prompt,
      size: data.size,
      n: n,
      model: data.model.modelId,
      modelName: settingsStore.getModelById(data.model.providerId, data.model.modelId).model?.name,
      images: currentPlaceholders
    }

    generatedBatches.value.push(newBatch)
    scrollToBottom()

    try {
      const provider = settingsStore.getProviderById(data.model.providerId)
      if (!provider) {
        throw new Error('未找到所选模型的提供商')
      }

      const result = await service.generateImage(prompt, {
        model: data.model.modelId,
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl || '',
        provider: provider.id,
        providerType: provider.providerType,
        size: data.size,
        n: n,
        seed: data.seed ? Number(data.seed) : undefined,
        providerOptions: data.providerOptions?.[provider.providerType]
      })

      if (result.images) {
        const newImages = result.images.map((img: any) => {
          if (typeof img === 'string') return img
          if (img.base64) {
            return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
          }
          return img.url || ''
        }).filter(Boolean)

        // 替换占位图
        const batch = generatedBatches.value.find(b => b.id === batchId)
        if (batch) {
          let placeholderIndex = 0
          batch.images = batch.images.map(item => {
            if (typeof item === 'object' && item.loading) {
              return newImages[placeholderIndex++] || item
            }
            return item
          })
        }
      }
    } catch (error: any) {
      console.error('图像生成失败:', error)
      // 移除失败的批次或更新状态
      generatedBatches.value = generatedBatches.value.filter(b => b.id !== batchId)
    }
  }
})

const { Trash, Download, Sparkles, Dices, Image: ImageIcon, Edit, Box, Screen } = useIcon(['Trash', 'Download', 'Sparkles', 'Dices', 'Image', 'Edit', 'Box', 'Screen'])

const clearImages = () => {
  imgStore.clearBatches()
}

const reEdit = (batch: ImageBatch) => {
  rightInput.value = batch.prompt
}

const deleteBatch = (batchId: number) => {
  imgStore.removeBatch(batchId)
}

const handleRightInputSubmit = () => {
  if (!rightInput.value.trim()) return
  formActions.submit()
  nextTick(() => {
    rightInput.value = ''
  })
}

const downloadImage = (item: string | { loading: boolean }) => {
  if (typeof item === 'string') {
    const link = document.createElement('a')
    link.href = item
    link.download = `image-${Date.now()}.png`
    link.click()
  }
}
</script>

<template>
  <div class="image-page-container">
    <FormContainer :show-header="false" class="form-section">
      <template #content>
        <ImageForm>
        </ImageForm>
      </template>
    </FormContainer>

    <FormContainer class="results-section" no-padding>
      <template #header>
        <span>生成结果</span>
        <div class="header-actions">
          <Button v-if="generatedBatches.length > 0" variant="text" size="sm" @click="clearImages">
            <Trash />
            清空结果
          </Button>
        </div>
      </template>

      <template #content>
        <div class="results-container" ref="resultsContainer">
          <div class="results-content">
            <div v-if="generatedBatches.length === 0" class="empty-state">
              <div class="empty-icon">
                <ImageIcon />
              </div>
              <p>在下方输入提示词，开启你的创作之旅</p>
            </div>
            <div v-else class="batches-list">
              <div v-for="batch in generatedBatches" :key="batch.id" class="generation-results">
                <div class="prompt-display">
                  <div class="prompt-header">
                    <span class="prompt-text">{{ batch.prompt }}</span>
                    <div class="prompt-actions">
                      <Button variant="icon" size="sm" @click="reEdit(batch)">
                        <Edit />
                      </Button>
                      <Button variant="icon" size="sm" class="delete-btn" @click="deleteBatch(batch.id)">
                        <Trash />
                      </Button>
                    </div>
                  </div>
                  <div class="prompt-meta">
                    <span v-if="batch.modelName" class="meta-item">
                      <Box /> {{ batch.modelName }}
                    </span>
                    <span v-if="batch.size" class="meta-item">
                      <Screen /> {{ batch.size }}
                    </span>
                  </div>
                </div>

                <div class="image-grid">
                  <div v-for="(img, index) in batch.images" :key="index" class="image-item">
                    <template v-if="typeof img === 'object' && img.loading">
                      <Image loading preview />
                    </template>
                    <template v-else>
                      <Image :src="(img as string)" preview
                        :images="(batch.images.filter(i => typeof i === 'string') as string[])"
                        :initial-index="batch.images.filter((i, idx) => typeof i === 'string' && idx <= index).length - 1" />
                      <div class="image-actions">
                        <Button variant="icon" size="sm" @click="downloadImage(img)">
                          <Download />
                        </Button>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="floating-input-area">
            <div class="input-box-wrapper" :class="{ disabled: !isModelSelected }">
              <div class="input-top">
                <textarea v-model="rightInput" :placeholder="isModelSelected ? '说说今天想做点什么' : '请先选择生成模型'"
                  :disabled="!isModelSelected" @keydown.enter.exact.prevent="handleRightInputSubmit" rows="1"></textarea>
                <Button variant="primary" size="sm" class="send-btn" :disabled="!isModelSelected || !rightInput.trim()"
                  @click="handleRightInputSubmit">
                  <template #icon>
                    <Sparkles />
                  </template>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </FormContainer>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  gap: 8px;
}

.image-page-container {
  display: flex;
  height: 100%;
  width: 100%;
}

.form-section {
  width: 350px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
  height: 100%;
}

.results-section {
  flex: 1;
  min-width: 0;
}

.results-section :deep(.settings-header) {
  justify-content: space-between;
}

:deep(.setting-content) {
  flex: 1;
}

.results-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background: var(--bg-app);
}

.results-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
}

.batches-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 24px;
}

.generation-results {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.prompt-display {
  margin-bottom: 16px;
  background: var(--bg-tertiary);
  padding: 12px;
  border-radius: 8px;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.prompt-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.generation-results:hover .prompt-actions {
  opacity: 1;
}

.delete-btn:hover {
  color: var(--error-color, #ff4d4f) !important;
}

.prompt-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
}

.prompt-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.image-item :deep(.n-image) {
  width: 100%;
  height: 100%;
}

.image-item :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .image-actions {
  opacity: 1;
}

.action-group {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.floating-input-area {
  padding: 20px 40px 40px;
  display: flex;
  justify-content: center;
}

.input-box-wrapper {
  width: 100%;
  max-width: 800px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  padding: 8px 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
}

.input-box-wrapper.disabled {
  background: var(--bg-secondary);
  opacity: 0.7;
  cursor: not-allowed;
}

.input-box-wrapper.disabled textarea {
  cursor: not-allowed;
}

.input-top {
  display: flex;
  gap: 12px;
  align-items: center;
}

.input-top textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  padding: 12px 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  min-height: 44px;
  display: flex;
  align-items: center;
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
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 16px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.2;
}

:deep(.form-container) {
  height: 100%;
}

:deep(.form-content) {
  padding: 0;
}
</style>
