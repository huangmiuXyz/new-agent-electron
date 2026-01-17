<script setup lang="tsx">
import { ImageGenerateOptions } from '@renderer/services/chatService';
import { createRegistry } from '@renderer/services/chatService/registry';
import { useSettingsStore } from '@renderer/stores/settings'
import { FormField } from '@renderer/composables/useForm'

const service = chatService()
const settingsStore = useSettingsStore()
const generatedImages = ref<(string | { loading: boolean; id: number })[]>([])
const lastGeneration = ref<{
  prompt: string;
  size?: string;
  n?: number;
  model?: string;
  modelName?: string;
} | null>(null)

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
    `providerOptions.${provider.id}`
  )

  if (fields.length === 0) return null

  return {
    name: `providerOptions.${provider.id}`,
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
    const n = data.n || 1
    const batchId = Date.now()
    const currentPlaceholders = Array(n).fill(null).map((_, i) => ({
      loading: true,
      id: batchId + i
    }))
    const placeholderIds = new Set(currentPlaceholders.map(p => p.id))
    generatedImages.value = [...currentPlaceholders, ...generatedImages.value]
    try {
      const provider = settingsStore.getProviderById(data.model.providerId)
      if (!provider) {
        throw new Error('未找到所选模型的提供商')
      }

      const result = await service.generateImage(data.prompt, {
        model: data.model.modelId,
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl || '',
        provider: provider.id,
        providerType: provider.providerType,
        size: data.size,
        n: n,
        seed: data.seed ? Number(data.seed) : undefined,
        providerOptions: data.providerOptions?.[provider.id]
      })

      lastGeneration.value = {
        prompt: data.prompt,
        size: data.size,
        n: n,
        model: data.model.modelId,
        modelName: settingsStore.getModelById(data.model.providerId, data.model.modelId).model?.name
      }

      if (result.images) {
        const newImages = result.images.map((img: any) => {
          if (typeof img === 'string') return img
          if (img.base64) {
            return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
          }
          return img.url || ''
        }).filter(Boolean)

        // 替换占位图
        let placeholderIndex = 0
        generatedImages.value = generatedImages.value.map(item => {
          if (typeof item === 'object' && item.loading && placeholderIds.has(item.id)) {
            return newImages[placeholderIndex++] || item
          }
          return item
        })
      }
    } catch (error: any) {
      console.error('图像生成失败:', error)
      // 移除当前批次的占位图
      generatedImages.value = generatedImages.value.filter(item => {
        if (typeof item === 'object' && item.loading && placeholderIds.has(item.id)) {
          return false
        }
        return true
      })
    }
  }
})

const { Trash, Download, Sparkles, Dices, Image, Edit, Refresh, MoreHorizontal, FileUpload, Search } = useIcon(['Trash', 'Download', 'Sparkles', 'Dices', 'Image', 'Edit', 'Refresh', 'MoreHorizontal', 'FileUpload', 'Search'])

const clearImages = () => {
  generatedImages.value = []
  lastGeneration.value = null
}

const reEdit = () => {
  if (!lastGeneration.value) return
  formActions.setFieldValue('prompt', lastGeneration.value.prompt)
  // Optionally scroll to prompt textarea or focus it
}

const generateAgain = () => {
  if (!lastGeneration.value) return
  formActions.submit()
}

const rightInput = ref('')
const handleRightInputSubmit = () => {
  if (!rightInput.value.trim()) return
  formActions.setFieldValue('prompt', rightInput.value)
  formActions.submit()
  rightInput.value = ''
}

const downloadImage = (item: string | { loading: boolean }) => {
  if (typeof item !== 'string') return
  const link = document.createElement('a')
  link.href = item.startsWith('data:') ? item : `data:image/png;base64,${item}`
  link.download = `generated-image-${Date.now()}.png`
  link.click()
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
          <Button v-if="generatedImages.length > 0" variant="text" size="sm" @click="clearImages">
            <Trash />
            清空结果
          </Button>
        </div>
      </template>

      <template #content>
        <div class="results-container">
          <div class="results-content">
            <div v-if="generatedImages.length === 0" class="empty-state">
              <div class="empty-icon">
                <Image />
              </div>
              <p>在左侧输入提示词，开启你的创作之旅</p>
            </div>

            <div v-else class="generation-results">
              <div v-if="lastGeneration" class="generation-info">
                <div class="prompt-text">{{ lastGeneration.prompt }}</div>
                <div class="parameters">
                  <span class="param-item">图片 {{ lastGeneration.n }}</span>
                  <span class="divider">|</span>
                  <span class="param-item">{{ lastGeneration.size }}</span>
                  <span class="divider">|</span>
                  <span class="param-item">{{ lastGeneration.modelName || lastGeneration.model }}</span>
                </div>
              </div>

              <div class="image-grid">
                <div v-for="(img, index) in generatedImages" :key="index" class="image-item">
                  <div class="ai-badge">AI生成</div>
                  <template v-if="typeof img === 'object' && img.loading">
                    <Image loading preview />
                  </template>
                  <template v-else>
                    <Image :src="(img as string)" preview
                      :images="(generatedImages.filter(i => typeof i === 'string') as string[])"
                      :initial-index="generatedImages.filter((i, idx) => typeof i === 'string' && idx <= index).length - 1" />
                    <div class="image-actions">
                      <Button variant="icon" size="sm" @click="downloadImage(img)">
                        <Download />
                      </Button>
                    </div>
                  </template>
                </div>
              </div>

              <div class="generation-actions">
                <Button variant="secondary" size="sm" @click="reEdit">
                  <template #icon>
                    <Edit />
                  </template>
                  重新编辑
                </Button>
                <Button variant="secondary" size="sm" @click="generateAgain">
                  <template #icon>
                    <Refresh />
                  </template>
                  再次生成
                </Button>
                <Button variant="secondary" size="sm">
                  <template #icon>
                    <MoreHorizontal />
                  </template>
                </Button>
              </div>
            </div>
          </div>

          <div class="floating-input-area">
            <div class="input-box-wrapper">
              <div class="input-top">
                <textarea v-model="rightInput" placeholder="说说今天想做点什么"
                  @keydown.enter.exact.prevent="handleRightInputSubmit" rows="1"></textarea>
                <Button variant="primary" size="sm" class="send-btn" :disabled="!rightInput.trim()"
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

.generation-results {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.generation-info {
  margin-bottom: 24px;
}

.prompt-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.parameters {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.divider {
  opacity: 0.3;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  width: calc(25% - 9px);
  min-width: 180px;
  flex-grow: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  transition: all 0.2s ease;
}

.image-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.ai-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  z-index: 2;
  pointer-events: none;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2;
}

.image-item:hover .image-actions {
  opacity: 1;
}

.generation-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 40px;
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
