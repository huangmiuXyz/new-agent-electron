<script setup lang="tsx">
import { ImageGenerateOptions } from '@renderer/services/chatService';
import { createRegistry } from '@renderer/services/chatService/registry';
import { useSettingsStore } from '@renderer/stores/settings'
import { FormField } from '@renderer/composables/useForm'

const service = chatService()
const settingsStore = useSettingsStore()
const generatedImages = ref<(string | { loading: boolean; id: number })[]>([])


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
    label: '模型参数',
    collapsible: true,
    defaultCollapsed: false,
    children: fields
  } as FormField<any>
}

const dynamicField = ref<FormField<any> | null>(null)

const baseFields = [
  {
    name: 'prompt',
    type: 'textarea',
    label: '提示词',
    placeholder: '描述你想要生成的图像...',
    required: true,
    rows: 4
  },
  {
    name: 'model',
    type: 'modelSelector',
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

// 图像生成表单
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

// 初始设置默认模型：尝试寻找第一个可用的图像模型
onMounted(() => {
  // 如果已经有持久化的数据，优先加载
  if (settingsStore.imageGenerationForm?.model?.providerId) {
    dynamicField.value = getDynamicImageFields(settingsStore.imageGenerationForm.model.providerId)
    return
  }

  const providers = settingsStore.getAllProviders
  for (const provider of providers) {
    const imageModel = provider.models?.find(m => m.category === 'image')
    if (imageModel) {
      formActions.setFieldValue('model', {
        modelId: imageModel.id,
        providerId: provider.id
      })
      // 初始化动态字段
      dynamicField.value = getDynamicImageFields(provider.id)
      break
    }
  }
})
const { Trash, Download, Sparkles, Dices, Image } = useIcon(['Trash', 'Download', 'Sparkles', 'Dices', 'Image'])

const clearImages = () => {
  generatedImages.value = []
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
          <template #footer>
            <Button variant="primary" block @click="formActions.submit()">
              <template #icon>
                <Sparkles />
              </template>
              立即生成
            </Button>
          </template>
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
        <div class="results-content">
          <div v-if="generatedImages.length === 0" class="empty-state">
            <div class="empty-icon">
              <Image />
            </div>
            <p>在左侧输入提示词，开启你的创作之旅</p>
          </div>

          <div v-else class="image-grid">
            <div v-for="(img, index) in generatedImages" :key="index" class="image-item">
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

.results-content {
  padding: 24px;
  overflow-y: auto;
  height: 100%;
}

.form-footer {
  margin-top: 24px;
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

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 24px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  width: calc(33.333% - 11px);
  min-width: 200px;
  flex-grow: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  transition: transform 0.2s ease;
}

.image-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.image-item.loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1;
}

.image-item:hover .image-actions {
  opacity: 1;
}

:deep(.form-container) {
  height: 100%;
}

:deep(.form-content) {
  padding: 0;
}
</style>
