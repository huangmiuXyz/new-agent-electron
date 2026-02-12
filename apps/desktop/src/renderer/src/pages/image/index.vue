<script setup lang="tsx">
import { useVirtualList } from '@vueuse/core'
import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import ImageSizeSelector from '@renderer/components/ImageSizeSelector.vue'
import GenerationResultCard from './GenerationResultCard.vue'
import FloatingInputArea from './FloatingInputArea.vue'
import { useImageGeneration } from '@renderer/composables/useImageGeneration'
import type { ModelCategory } from '@agent-qi/types'

const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const { generatedBatches, startGeneration, resumeGeneration, startVideoGeneration, createImageBatch, createVideoBatch } = useImageGeneration()

// 当前是否为视频生成模式
const isVideoMode = ref(false)

// 固定高度虚拟滚动
const ITEM_HEIGHT = 320
const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(generatedBatches, {
  itemHeight: ITEM_HEIGHT,
  overscan: 2
})

// 获取动态字段
const getDynamicFields = (providerId: string, isVideo: boolean) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  if (!providerInstance) return null

  const schema = isVideo ? providerInstance.videoCallOptionsSchema : providerInstance.imageCallOptionsSchema
  if (!schema) return null

  const fields = zodSchemasToFormfields(schema, `providerOptions.${provider.providerType}`)

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

// 图片表单动态字段
const imageDynamicField = ref<FormField<any> | null>(null)
// 视频表单动态字段
const videoDynamicField = ref<FormField<any> | null>(null)

// 切换模式的处理
const handleModeSwitch = (isVideo: boolean) => {
  isVideoMode.value = isVideo
}

// 图片表单字段
const imageFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['image'] as ModelCategory[],
      required: true,
      onChange: ({ providerId }: { providerId: string; modelId: string }) => {
        imageDynamicField.value = getDynamicFields(providerId, false)
      }
    },
    {
      name: 'size',
      type: 'custom',
      label: '图像尺寸',
      defaultValue: '1024x1024',
      render: (data: any) => (
        <ImageSizeSelector
          modelValue={data.size}
          onUpdate:modelValue={(val: string) => imageFormActions.setFieldValue('size', val)}
        />
      )
    } as FormField<any>,
    {
      name: 'n',
      type: 'slider',
      label: '生成数量',
      min: 1,
      max: 4,
      step: 1,
      defaultValue: 1
    } as FormField<any>,
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
            imageFormActions.setFieldValue('seed', randomSeed)
          }}
        >
          {Dices}
        </Button>
      )
    } as FormField<any>
  ]

  if (imageDynamicField.value) {
    fields.push(imageDynamicField.value)
  }

  return fields
})

// 视频表单字段
const videoFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['video'] as ModelCategory[],
      required: true,
      onChange: ({ providerId }: { providerId: string; modelId: string }) => {
        videoDynamicField.value = getDynamicFields(providerId, true)
      }
    },
    {
      name: 'duration',
      type: 'select',
      label: '视频时长',
      defaultValue: 5,
      options: [
        { label: '5秒', value: 5 },
        { label: '10秒', value: 10 },
        { label: '15秒', value: 15 }
      ]
    } as FormField<any>,
    {
      name: 'resolution',
      type: 'select',
      label: '分辨率',
      defaultValue: '720p',
      options: [
        { label: '540p', value: '540p' },
        { label: '720p', value: '720p' },
        { label: '1080p', value: '1080p' }
      ]
    } as FormField<any>,
    {
      name: 'n',
      type: 'slider',
      label: '生成视频数',
      min: 1,
      max: 1,
      step: 1,
      defaultValue: 1
    } as FormField<any>,
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
            videoFormActions.setFieldValue('seed', randomSeed)
          }}
        >
          {Dices}
        </Button>
      )
    } as FormField<any>
  ]

  if (videoDynamicField.value) {
    fields.push(videoDynamicField.value)
  }

  return fields
})

const rightInput = ref('')
const floatingInputRef = ref<InstanceType<typeof FloatingInputArea>>()

const isModelSelected = computed(() => {
  const currentForm = isVideoMode.value ? videoFormActions.getData() : imageFormActions.getData()
  return !!currentForm?.model?.modelId
})

const scrollToBottom = () => {
  nextTick(() => {
    scrollTo(generatedBatches.value.length - 1)
  })
}

// 图片生成表单
const [ImageForm, imageFormActions] = useForm({
  fields: () => imageFields.value,
  onChange: (_field, _value, data) => {
    settingsStore.updateImageGenerationForm({
      ...data,
      mediaType: 'image'
    })
  },
  onSubmit: async (data) => {
    const prompt = rightInput.value.trim()
    if (!prompt) return

    const referenceImages = floatingInputRef.value?.referenceImages || []

    const batch = createImageBatch({
      prompt,
      model: data.model.modelId,
      providerId: data.model.providerId,
      size: data.size,
      n: data.n,
      seed: data.seed ? Number(data.seed) : undefined,
      providerOptions: data.providerOptions,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined
    })

    generatedBatches.value.push(batch)
    floatingInputRef.value?.clearReferenceImages()
    startGeneration(batch)
  }
})

// 视频生成表单
const [VideoForm, videoFormActions] = useForm({
  fields: () => videoFields.value,
  onChange: (_field, _value, data) => {
    settingsStore.updateImageGenerationForm({
      ...data,
      mediaType: 'video'
    })
  },
  onSubmit: async (data) => {
    const prompt = rightInput.value.trim()
    if (!prompt) return

    const referenceImages = floatingInputRef.value?.referenceImages || []

    const batch = createVideoBatch({
      prompt,
      model: data.model.modelId,
      providerId: data.model.providerId,
      n: data.n,
      seed: data.seed ? Number(data.seed) : undefined,
      duration: data.duration ? Number(data.duration) : undefined,
      resolution: data.resolution,
      providerOptions: data.providerOptions,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined
    })

    generatedBatches.value.push(batch)
    floatingInputRef.value?.clearReferenceImages()
    startVideoGeneration(batch)
  }
})

const { Trash, Dices, Image: ImageIcon, Screen } = useIcon(['Trash', 'Dices', 'Image', 'Screen'])

const copyPrompt = (prompt: string) => {
  copyText(prompt)
}

const clearImages = () => {
  imgStore.clearBatches()
}

const reEdit = (batch: ImageBatch) => {
  rightInput.value = batch.prompt
  isVideoMode.value = batch.mediaType === 'video'

  const formData = {
    model: {
      modelId: batch.model,
      providerId: batch.providerId
    },
    n: batch.n,
    seed: batch.seed,
    providerOptions: batch.params?.providerOptions
  }

  if (batch.mediaType === 'video') {
    videoFormActions.setFieldsValue({
      ...formData,
      duration: batch.duration,
      resolution: batch.resolution
    } as any)
    if (batch.providerId) {
      videoDynamicField.value = getDynamicFields(batch.providerId, true)
    }
  } else {
    imageFormActions.setFieldsValue({
      ...formData,
      size: batch.size
    } as any)
    if (batch.providerId) {
      imageDynamicField.value = getDynamicFields(batch.providerId, false)
    }
  }

  // 恢复参考图片
  if (batch.referenceImages && batch.referenceImages.length > 0 && floatingInputRef.value) {
    floatingInputRef.value.referenceImages = [...batch.referenceImages]
  }
}

const deleteBatch = (batchId: number) => {
  imgStore.removeBatch(batchId)
}

const handleRightInputSubmit = () => {
  if (!rightInput.value.trim()) return

  if (isVideoMode.value) {
    videoFormActions.submit()
  } else {
    imageFormActions.submit()
  }

  nextTick(() => {
    rightInput.value = ''
    floatingInputRef.value?.clearInput()
    scrollToBottom()
  })
}

onMounted(async () => {
  // 恢复图片表单
  if (settingsStore.imageGenerationForm?.model?.providerId) {
    imageFormActions.setData(settingsStore.imageGenerationForm)
    imageDynamicField.value = getDynamicFields(settingsStore.imageGenerationForm.model.providerId, false)
    if (settingsStore.imageGenerationForm.prompt) {
      rightInput.value = settingsStore.imageGenerationForm.prompt
    }
  }

  // 恢复视频表单
  if (settingsStore.videoGenerationForm?.model?.providerId) {
    videoFormActions.setData(settingsStore.videoGenerationForm)
    videoDynamicField.value = getDynamicFields(settingsStore.videoGenerationForm.model.providerId, true)
  }

  // 恢复未完成的任务
  generatedBatches.value.forEach((batch) => {
    if (batch.taskId && batch.status !== 'completed') {
      resumeGeneration(batch)
    }
  })
})
</script>

<template>
  <div class="image-page-container">
    <ResizeBox
      v-model:width="settingsStore.display.imageSidebarWidth"
      v-model:is-collapsed="settingsStore.display.sidebarCollapsed"
      :min-size="250"
      :max-size="500"
    >
      <FormContainer :show-header="false" class="form-section">
        <template #content>
          <!-- 模式切换 -->
          <div class="mode-switcher">
            <div class="mode-tab" :class="{ active: !isVideoMode }" @click="handleModeSwitch(false)">
              <ImageIcon />
              <span>图片生成</span>
            </div>
            <div class="mode-tab" :class="{ active: isVideoMode }" @click="handleModeSwitch(true)">
              <Screen />
              <span>视频生成</span>
            </div>
          </div>

          <ImageForm v-if="!isVideoMode" />
          <VideoForm v-else />
        </template>
      </FormContainer>
    </ResizeBox>

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
          <div class="results-content" v-bind="containerProps">
            <div v-if="generatedBatches.length === 0" class="empty-state">
              <div class="empty-icon">
                <ImageIcon />
              </div>
              <p>在下方输入提示词，开启你的创作之旅</p>
            </div>
            <div v-else class="batches-list" v-bind="wrapperProps">
              <GenerationResultCard
                v-for="{ data: batch } in virtualList"
                :key="batch.id"
                :batch="batch"
                @re-edit="reEdit"
                @delete="deleteBatch"
                @copy-prompt="copyPrompt"
              />
            </div>
          </div>

          <FloatingInputArea
            ref="floatingInputRef"
            v-model:input="rightInput"
            :is-model-selected="isModelSelected"
            @submit="handleRightInputSubmit"
          />
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
  width: 100%;
  border-right: 1px solid var(--border-subtle);
  height: 100%;
}

.mode-switcher {
  display: flex;
  padding: 3px;
  gap: 2px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-bottom: 8px;
}

.mode-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.mode-tab:hover {
  color: var(--text-secondary);
}

.mode-tab.active {
  background: var(--bg-card);
  color: var(--accent-color);
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
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
  scroll-behavior: smooth;
  padding-bottom: 100px;
  height: 100% !important;
}

.results-content > div {
  max-width: 1000px;
  margin: 0 auto;
}

.batches-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 32px;
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
