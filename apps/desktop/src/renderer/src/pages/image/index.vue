<script setup lang="tsx">
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
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const handleInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = '44px' // Reset to min-height first
    const scrollHeight = textareaRef.value.scrollHeight
    if (scrollHeight > 44) {
      textareaRef.value.style.height = `${scrollHeight}px`
    }
  }
}

watch(rightInput, () => {
  nextTick(handleInput)
})

const isOptimizing = ref(false)
const optimizeModelId = useLocalStorage('optimizeModelId', settingsStore.selectedModelId)
const optimizeProviderId = useLocalStorage('optimizeProviderId', settingsStore.selectedProviderId)

const optimizePrompt = async (mId?: string, pId?: string) => {
  if (!rightInput.value.trim() || isOptimizing.value) return

  const modelId = mId || optimizeModelId.value
  const providerId = pId || optimizeProviderId.value

  if (!modelId || !providerId) {
    messageApi.warning('请先选择一个用于优化的语言模型')
    return
  }

  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return

  isOptimizing.value = true
  const originalPrompt = rightInput.value
  rightInput.value = ''

  try {
    await service.streamText(
      `你是一个专业的 AI 绘画提示词专家。你的任务是将用户提供的简单描述，改写并扩充成详细、生动且专业的 AI 绘画提示词。请遵循以下规则：\n1. 使用英语（除非用户特别要求其他语言）。\n2. 增加关于光影、构图、风格、艺术媒介、细节描述的词汇。\n3. 保持原始意图，不要改变主题。\n4. 只返回优化后的提示词内容，不要有任何解释性文字。\n\n用户描述：${originalPrompt}`,
      {
        model: modelId,
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl || '',
        provider: provider.id,
        providerType: provider.providerType,
        onData: (text) => {
          rightInput.value += text
          nextTick(handleInput)
        },
        onFinish: () => {
          isOptimizing.value = false
        }
      }
    )
  } catch (error) {
    console.error('Prompt optimization failed:', error)
    if (!rightInput.value) {
      rightInput.value = originalPrompt
    }
    isOptimizing.value = false
  }
}

const handleOptimizeModelChange = (val: { modelId: string, providerId: string }) => {
  optimizeModelId.value = val.modelId
  optimizeProviderId.value = val.providerId
}

const isModelSelected = computed(() => {
  return !!settingsStore.imageGenerationForm?.model?.modelId
})

const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
  nextTick(() => {
    if (resultsContainer.value) {
      resultsContainer.value.scrollTo({
        top: resultsContainer.value.scrollHeight,
        behavior
      })
    }
  })
}

const [ImageForm, formActions] = useForm({
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
          scrollToBottom()
        }
      }
    } catch (error: any) {
      console.error('图像生成失败:', error)
      generatedBatches.value = generatedBatches.value.filter(b => b.id !== batchId)
    }
  }
})

const { Trash, Sparkles, Dices, Image: ImageIcon, Edit, Copy, X, Bulb } = useIcon(['Trash', 'Download', 'Sparkles', 'Dices', 'Image', 'Edit', 'Box', 'Screen', 'Copy', 'X', 'Bulb'])

const copyPrompt = (prompt: string) => {
  copyText(prompt)
}

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
    if (textareaRef.value) {
      textareaRef.value.style.height = '44px'
    }
    scrollToBottom()
  })
}

onMounted(async () => {
  await settingsStore.isAfterRestore
  formActions.setData(settingsStore.imageGenerationForm)
  dynamicField.value = getDynamicImageFields(settingsStore.imageGenerationForm?.model.providerId!)
})
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
        <div class="results-container">
          <div class="results-content" ref="resultsContainer">
            <div v-if="generatedBatches.length === 0" class="empty-state">
              <div class="empty-icon">
                <ImageIcon />
              </div>
              <p>在下方输入提示词，开启你的创作之旅</p>
            </div>
            <div v-else class="batches-list">
              <Card v-for="batch in generatedBatches" :key="batch.id" padding="20px" radius="16px"
                class="generation-results">
                <div class="prompt-card">
                  <div class="prompt-header">
                    <div class="prompt-content">
                      <span class="prompt-label">提示词</span>
                      <p class="prompt-text">{{ batch.prompt }}</p>
                    </div>
                    <div class="prompt-actions">
                      <Button variant="icon" size="sm" title="复制提示词" @click="copyPrompt(batch.prompt)">
                        <Copy />
                      </Button>
                      <Button variant="icon" size="sm" title="重新编辑" @click="reEdit(batch)">
                        <Edit />
                      </Button>
                      <Button variant="icon" size="sm" class="delete-btn" title="删除批次" @click="deleteBatch(batch.id)">
                        <Trash />
                      </Button>
                    </div>
                  </div>
                  <div class="prompt-meta">
                    <Tags v-if="batch.modelName" :tags="[batch.modelName]" color="blue" />
                    <Tags v-if="batch.size" :tags="[batch.size]" color="green" />
                  </div>
                </div>

                <div class="image-grid">
                  <div v-for="(img, index) in batch.images" :key="index" class="image-item">
                    <template v-if="typeof img === 'object' && img.loading">
                      <div class="image-loading">
                        <div class="loading-spinner"></div>
                        <span>生成中...</span>
                      </div>
                    </template>
                    <template v-else>
                      <Image :src="(img as string)" preview
                        :images="(batch.images.filter(i => typeof i === 'string') as string[])"
                        :initial-index="batch.images.filter((i, idx) => typeof i === 'string' && idx <= index).length - 1" />
                    </template>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div class="floating-input-area">
            <Card class="input-box-wrapper" :class="{ disabled: !isModelSelected }" radius="24px" padding="8px 16px">
              <div class="input-top">
                <textarea ref="textareaRef" v-model="rightInput"
                  :placeholder="isModelSelected ? '说说今天想做点什么' : '请先选择生成模型'" :disabled="!isModelSelected || isOptimizing"
                  @keydown.enter.exact.prevent="handleRightInputSubmit" rows="1" @input="handleInput"></textarea>

                <div class="input-actions">
                  <ModelSelector v-model:modelId="optimizeModelId" v-model:providerId="optimizeProviderId"
                    popup-position="top" type="icon" category="text" class="optimize-model-selector"
                    @update:model-id="(id) => handleOptimizeModelChange({ modelId: id, providerId: optimizeProviderId })"
                    @update:provider-id="(id) => handleOptimizeModelChange({ modelId: optimizeModelId, providerId: id })" />
                  <Button v-if="rightInput || isOptimizing" variant="text" size="sm" class="optimize-btn" title="优化提示词"
                    :loading="isOptimizing" @click="() => optimizePrompt()">
                    <Bulb />
                  </Button>
                  <Button v-if="rightInput && !isOptimizing" variant="text" size="sm" class="clear-btn"
                    @click="rightInput = ''">
                    <X />
                  </Button>
                  <Button variant="primary" size="sm" class="send-btn"
                    :disabled="!isModelSelected || !rightInput.trim() || isOptimizing" @click="handleRightInputSubmit">
                    <template #icon>
                      <Sparkles />
                    </template>
                  </Button>
                </div>
              </div>
            </Card>
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
  background: var(--bg-secondary);
}

.results-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  min-height: 0;
  scroll-behavior: smooth;
  padding-bottom: 100px;
}

.batches-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding-bottom: 32px;
  max-width: 1000px;
  margin: 0 auto;
}

.prompt-card {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.prompt-content {
  flex: 1;
}

.prompt-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.prompt-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  word-break: break-word;
  margin: 0;
  font-weight: 500;
}

.prompt-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.generation-results:hover .prompt-actions {
  opacity: 1;
}

.delete-btn:hover {
  color: var(--error-color, #ff4d4f) !important;
  background: rgba(255, 77, 79, 0.1) !important;
}

.prompt-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}


.image-item :deep(.n-image) {
  width: 100%;
  height: 100%;
}

.image-item :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s;
}


.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 60%, rgba(0, 0, 0, 0.4));
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 10px;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}


.download-overlay-btn {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.2) !important;
  backdrop-filter: blur(8px);
  color: white !important;
  border-radius: 8px !important;
}


.image-loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  background: var(--bg-secondary);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.action-group {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.floating-input-area {
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

.input-box-wrapper.disabled textarea {
  cursor: not-allowed;
}

.input-top {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.input-top textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  padding: 10px 4px;
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
  /* Golden color for magic/bulb */
}

.btn-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 20px;
  padding: 40px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.15;
  background: var(--bg-secondary);
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 16px;
  font-weight: 500;
  max-width: 300px;
  line-height: 1.6;
}

:deep(.form-container) {
  height: 100%;
}

:deep(.form-content) {
  padding: 0;
}
</style>
