<script setup lang="tsx">
import { useSettingsStore } from '@renderer/stores/settings'

const service = chatService()
const settingsStore = useSettingsStore()
const generatedImages = ref<string[]>([])
const isGenerating = ref(false)

// 图像生成表单
const [ImageForm, formActions] = useForm({
  fields: [
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
      required: true
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
  ],
  onSubmit: async (data) => {
    if (isGenerating.value) return
    isGenerating.value = true
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
        n: data.n,
        seed: data.seed ? Number(data.seed) : undefined
      })

      if (result.images) {
        const newImages = result.images.map((img: any) => {
          if (typeof img === 'string') return img
          if (img.base64) {
            return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
          }
          return img.url || ''
        }).filter(Boolean)

        generatedImages.value = [...newImages, ...generatedImages.value]
      }
    } catch (error: any) {
      console.error('图像生成失败:', error)
    } finally {
      isGenerating.value = false
    }
  }
})

// 初始设置默认模型：尝试寻找第一个可用的图像模型
onMounted(() => {
  const providers = settingsStore.getAllProviders
  for (const provider of providers) {
    const imageModel = provider.models?.find(m => m.category === 'image')
    if (imageModel) {
      formActions.setFieldValue('model', {
        modelId: imageModel.id,
        providerId: provider.id
      })
      break
    }
  }
})

const { Trash, Download, Sparkles, Dices } = useIcon(['Trash', 'Download', 'Sparkles', 'Dices'])

const clearImages = () => {
  generatedImages.value = []
}

const downloadImage = (base64: string) => {
  const link = document.createElement('a')
  link.href = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
  link.download = `generated-image-${Date.now()}.png`
  link.click()
}
</script>

<template>
  <FormContainer header-title="图像生成">
    <template #header>
      <div class="header-content">
        <span>图像生成</span>
        <div class="header-actions">
          <Button v-if="generatedImages.length > 0" variant="text" size="sm" @click="clearImages">
            <Trash />
            清空结果
          </Button>
        </div>
      </div>
    </template>

    <template #content>
      <div class="image-page-container">
        <div class="form-section">
          <ImageForm>
            <template #footer>
              <div class="form-footer">
                <Button variant="primary" size="lg" block :loading="isGenerating" @click="formActions.submit()">
                  <template #icon>
                    <Sparkles v-if="!isGenerating" />
                  </template>
                  {{ isGenerating ? '正在生成...' : '立即生成' }}
                </Button>
              </div>
            </template>
          </ImageForm>
        </div>

        <div class="results-section">
          <div v-if="generatedImages.length === 0 && !isGenerating" class="empty-state">
            <div class="empty-icon">
              <Sparkles />
            </div>
            <p>在左侧输入提示词，开启你的创作之旅</p>
          </div>

          <div v-else class="image-grid">
            <div v-if="isGenerating" class="image-item loading">
              <Image loading preview />
            </div>
            <div v-for="(img, index) in generatedImages" :key="index" class="image-item">
              <Image :src="img" preview :images="generatedImages" :initial-index="index" />
              <div class="image-actions">
                <Button variant="icon" size="sm" @click="downloadImage(img)">
                  <Download />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.image-page-container {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 24px;
  height: 100%;
}

.form-section {
  border-right: 1px solid var(--border-subtle);
  padding-right: 24px;
  height: 100%;
  overflow-y: auto;
}

.form-footer {
  margin-top: 24px;
}

.results-section {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  min-height: 400px;
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  padding-bottom: 24px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
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

@media (max-width: 900px) {
  .image-page-container {
    grid-template-columns: 1fr;
  }

  .form-section {
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    padding-right: 0;
    padding-bottom: 24px;
  }
}
</style>
