<script lang="tsx">
const activeProcessingIds = new Set<number>()
</script>

<script setup lang="tsx">
import { useVirtualList } from '@vueuse/core'
import { createRegistry } from '@renderer/services/chatService/registry';
import { useSettingsStore } from '@renderer/stores/settings'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import ImageSizeSelector from '@renderer/components/ImageSizeSelector.vue'
import FileUpload from '@renderer/components/FileUpload.vue'
import { blobToDataURL } from 'blob-util'
import type { ModelCategory } from '@agent-qi/types'

const service = chatService()
const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const { generatedBatches } = storeToRefs(imgStore)

// 当前是否为视频生成模式（根据选择的模型类别判断）
const isVideoMode = ref(false)

// 固定高度虚拟滚动
const ITEM_HEIGHT = 320
const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(generatedBatches, {
  itemHeight: ITEM_HEIGHT,
  overscan: 2
})

// 参考图片 - 使用 FileUpload 组件
const referenceImages = ref<string[]>([])

// 添加参考图片 - 使用 useUpload 的 triggerUpload
const { triggerUpload } = useUpload({
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

// 添加参考图片
const handleAddReferenceImage = () => {
  triggerUpload(true)
}

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

  const fields = zodSchemasToFormfields(
    schema,
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

// 获取当前选中模型的类别
const getModelCategory = (providerId: string, modelId: string): ModelCategory => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return 'text'
  const model = provider.models?.find(m => m.id === modelId)
  return model?.category || 'text'
}

const baseFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['image', 'video'] as ModelCategory[], // 同时显示图像和视频模型
      required: true,
      onChange: ({ providerId, modelId }: { providerId: string; modelId: string }) => {
        const category = getModelCategory(providerId, modelId)
        const newIsVideoMode = (category as string) === 'video'
        isVideoMode.value = newIsVideoMode
        dynamicField.value = getDynamicFields(providerId, isVideoMode.value)

        // 切换模式时，尝试恢复对应模式的表单数据
        const savedForm = newIsVideoMode ? settingsStore.videoGenerationForm : settingsStore.imageGenerationForm
        if (savedForm) {
          // 排除 model 字段，避免 setData 覆盖当前正在切换的模型，导致切换失效
          const { model: _, ...otherData } = savedForm
          formActions.setFieldsValue(otherData as any)
        }
      }
    }
  ]

  // 图像模式显示尺寸选择
  if (!isVideoMode.value) {
    fields.push({
      name: 'size',
      type: 'custom',
      label: '图像尺寸',
      defaultValue: '1024x1024',
      render: (data: any) => (
        <ImageSizeSelector
          modelValue={data.size}
          onUpdate:modelValue={(val: string) => formActions.setFieldValue('size', val)}
        />
      )
    } as FormField<any>)
  } else {
    // 视频模式显示视频特有配置
    fields.push(
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
      } as FormField<any>
    )
  }

  // 通用字段
  fields.push(
    {
      name: 'n',
      type: 'slider',
      label: isVideoMode.value ? '生成视频数' : '生成数量',
      min: 1,
      max: isVideoMode.value ? 1 : 4,
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
            formActions.setFieldValue('seed', randomSeed)
          }}
        >
          {Dices}
        </Button>
      )
    } as FormField<any>
  )

  return fields
})

const allFields = computed<FormField<any>[]>(() => {
  const fields = [...baseFields.value]
  if (dynamicField.value) {
    fields.push(dynamicField.value)
  }
  return fields
})

const rightInput = ref('')
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

const scrollToBottom = () => {
  nextTick(() => {
    scrollTo(generatedBatches.value.length - 1)
  })
}

const [ImageForm, formActions] = useForm({
  fields: () => allFields.value,
  onChange: (_field, _value, data) => {
    settingsStore.updateImageGenerationForm({
      ...data,
      mediaType: isVideoMode.value ? 'video' : 'image'
    })
  },
  onSubmit: async (data) => {
    const prompt = rightInput.value.trim()
    if (!prompt) {
      return
    }

    const n = data.n || 1
    const batchId = Date.now()
    const currentPlaceholders = Array(n).fill(null).map((_, i) => ({
      loading: true,
      id: batchId + i
    }))

    const provider = settingsStore.getProviderById(data.model.providerId)
    if (!provider) {
      throw new Error('未找到所选模型的提供商')
    }

    // 准备参考图片数据
    const refImagesData = referenceImages.value.length > 0 ? [...referenceImages.value] : undefined

    const newBatch: ImageBatch = {
      id: batchId,
      prompt: prompt,
      size: isVideoMode.value ? undefined : data.size,
      n: n,
      model: data.model.modelId,
      modelName: settingsStore.getModelById(data.model.providerId, data.model.modelId).model?.name,
      images: currentPlaceholders,
      providerId: data.model.providerId,
      status: 'pending',
      seed: data.seed ? Number(data.seed) : undefined,
      params: {
        providerOptions: data.providerOptions
      },
      referenceImages: refImagesData,
      mediaType: isVideoMode.value ? 'video' : 'image',
      duration: isVideoMode.value ? data.duration : undefined,
      resolution: isVideoMode.value ? data.resolution : undefined
    }

    generatedBatches.value.push(newBatch)

    // 清空参考图片
    referenceImages.value = []

    if (!activeProcessingIds.has(newBatch.id)) {
      if (isVideoMode.value) {
        startVideoGeneration(newBatch)
      } else {
        startGeneration(newBatch)
      }
    }
  }
})

const getProviderInstance = (providerId: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) {
    throw new Error('未找到所选模型的提供商')
  }

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  return {
    instance: registry.getProvider(provider.providerType),
    provider
  }
}

const startGeneration = async (batch: ImageBatch) => {
  if (activeProcessingIds.has(batch.id)) return
  activeProcessingIds.add(batch.id)

  const processedImages = await Promise.all(
    (batch.referenceImages || []).map(async (img) => {
      if (img.startsWith('data:')) {
        return img.split(',')[1]
      }
      if (img.startsWith('blob:')) {
        const response = await fetch(img)
        const blob = await response.blob()
        const base64 = await blobToDataURL(blob)
        return base64.split(',')[1]
      }
      return img
    })
  )

  const prompt = processedImages.length > 0
    ? {
      text: batch.prompt,
      images: processedImages
    }
    : batch.prompt
  try {
    const { instance: providerInstance, provider } = getProviderInstance(batch.providerId!)

    if (providerInstance?.generateImageAsyncTask) {
      const { task_id } = await providerInstance.generateImageAsyncTask({
        model: providerInstance.imageModel(batch.model),
        prompt: batch.prompt,
        size: batch.size as `${number}x${number}`,
        n: batch.n,
        ...batch.params
      })

      imgStore.updateBatch(batch.id, { taskId: task_id, status: 'processing' })
      await pollAsyncResult(batch.id, task_id, providerInstance)
    } else {
      const result = await service.generateImage(prompt, {
        model: batch.model,
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl || '',
        provider: provider.id,
        providerType: provider.providerType,
        size: batch.size as `${number}x${number}`,
        n: batch.n,
        seed: batch.seed,
        providerOptions: batch.params?.providerOptions
      })
      if (result.images) {
        processImages(batch.id, result.images)
      }
    }
  } catch (error: any) {
    console.error('图像生成失败:', { error })
    imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
    const b = generatedBatches.value.find((b) => b.id === batch.id)
    if (b && (!b.images || b.images.every((img) => typeof img === 'object' && img.loading))) {
      generatedBatches.value = generatedBatches.value.filter((b) => b.id !== batch.id)
    }
  } finally {
    activeProcessingIds.delete(batch.id)
  }
}

const resumeGeneration = async (batch: ImageBatch) => {
  if (activeProcessingIds.has(batch.id) || batch.status === 'completed') return
  activeProcessingIds.add(batch.id)

  try {
    const { instance: providerInstance } = getProviderInstance(batch.providerId!)
    if (batch.taskId && providerInstance?.asyncResult) {
      await pollAsyncResult(batch.id, batch.taskId, providerInstance)
    }
  } catch (error: any) {
    console.error('恢复图像生成失败:', error)
    imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
  } finally {
    activeProcessingIds.delete(batch.id)
  }
}

const activePolls = new Set<number>()

const pollAsyncResult = async (batchId: number, taskId: string, providerInstance: any) => {
  if (activePolls.has(batchId)) return
  activePolls.add(batchId)

  const poll = async () => {
    try {
      // 检查任务是否还在列表中（可能被用户删除了）
      const exists = generatedBatches.value.some((b) => b.id === batchId)
      if (!exists) {
        activePolls.delete(batchId)
        return
      }

      const result = await providerInstance.asyncResult({ task_id: taskId })
      if (result.images && result.images.length > 0) {
        processImages(batchId, result.images)
        activePolls.delete(batchId)
      } else if (result.status === 'failed') {
        throw new Error(result.error || '生成失败')
      } else {
        // 继续轮询
        setTimeout(poll, 3000)
      }
    } catch (error: any) {
      console.error('异步获取图像失败:', error)
      activePolls.delete(batchId)
      imgStore.updateBatch(batchId, { status: 'failed', error: error.message })
    }
  }

  poll()
}

const processImages = (batchId: number, rawImages: any[]) => {
  const newImages = rawImages.map((img: any) => {
    if (typeof img === 'string') return img
    if (img.base64) {
      return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
    }
    return img.url || ''
  }).filter(Boolean)

  const batch = generatedBatches.value.find(b => b.id === batchId)
  if (batch) {
    let placeholderIndex = 0
    const updatedImages = batch.images.map(item => {
      if (typeof item === 'object' && item.loading) {
        return newImages[placeholderIndex++] || item
      }
      return item
    })
    imgStore.updateBatch(batchId, {
      images: updatedImages,
      status: 'completed'
    })
    scrollToBottom()
  }
}

// 视频生成方法
const startVideoGeneration = async (batch: ImageBatch) => {
  if (activeProcessingIds.has(batch.id)) return
  activeProcessingIds.add(batch.id)

  try {
    const { instance: providerInstance, provider } = getProviderInstance(batch.providerId!)

    if (providerInstance?.generateVideoAsyncTask) {
      const { task_id } = await providerInstance.generateVideoAsyncTask({
        model: batch.model,
        prompt: batch.prompt,
        n: batch.n,
        duration: batch.duration,
        resolution: batch.resolution,
        seed: batch.seed,
        providerOptions: batch.params?.providerOptions
      })

      imgStore.updateBatch(batch.id, { taskId: task_id, status: 'processing' })
      await pollAsyncVideoResult(batch.id, task_id, providerInstance)
    } else {
      const result = await service.generateVideo(batch.prompt, {
        model: batch.model,
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl || '',
        provider: provider.id,
        providerType: provider.providerType,
        n: batch.n,
        duration: batch.duration ? Number(batch.duration) : undefined,
        resolution: batch.resolution,
        seed: batch.seed,
        providerOptions: batch.params?.providerOptions
      })

      if (result.videos) {
        processVideos(batch.id, result.videos)
      }
    }
  } catch (error: any) {
    console.error('视频生成失败:', { error })
    imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
    const b = generatedBatches.value.find((b) => b.id === batch.id)
    if (b && (!b.images || b.images.every((img) => typeof img === 'object' && img.loading))) {
      generatedBatches.value = generatedBatches.value.filter((b) => b.id !== batch.id)
    }
  } finally {
    activeProcessingIds.delete(batch.id)
  }
}

const processVideos = (batchId: number, rawVideos: any[]) => {
  const newVideos = rawVideos.map((video: any) => {
    if (typeof video === 'string') return video
    if (video.url) return video.url
    if (video.base64) {
      return video.base64.startsWith('data:') ? video.base64 : `data:video/mp4;base64,${video.base64}`
    }
    return ''
  }).filter(Boolean)

  const batch = generatedBatches.value.find(b => b.id === batchId)
  if (batch) {
    let placeholderIndex = 0
    const updatedVideos = batch.images.map(item => {
      if (typeof item === 'object' && item.loading) {
        return newVideos[placeholderIndex++] || item
      }
      return item
    })
    imgStore.updateBatch(batchId, {
      images: updatedVideos,
      status: 'completed'
    })
    scrollToBottom()
  }
}

const pollAsyncVideoResult = async (batchId: number, taskId: string, providerInstance: any) => {
  if (activePolls.has(batchId)) return
  activePolls.add(batchId)

  const poll = async () => {
    try {
      const exists = generatedBatches.value.some((b) => b.id === batchId)
      if (!exists) {
        activePolls.delete(batchId)
        return
      }

      const result = await providerInstance.asyncVideoResult?.({ task_id: taskId })
      if (result.videos && result.videos.length > 0) {
        processVideos(batchId, result.videos)
        activePolls.delete(batchId)
      } else if (result.status === 'failed') {
        throw new Error(result.error || '视频生成失败')
      } else {
        setTimeout(poll, 5000)
      }
    } catch (error: any) {
      console.error('异步获取视频失败:', error)
      activePolls.delete(batchId)
      imgStore.updateBatch(batchId, { status: 'failed', error: error.message })
    }
  }

  poll()
}

const { Trash, Dices, Image: ImageIcon, Edit, Copy, X, Bulb, Plus, Send } = useIcon(['Trash', 'Download', 'Dices', 'Image', 'Edit', 'Box', 'Screen', 'Copy', 'X', 'Bulb', 'Plus', 'Send'])

const copyPrompt = (prompt: string) => {
  copyText(prompt)
}

const clearImages = () => {
  imgStore.clearBatches()
}

const reEdit = (batch: ImageBatch) => {
  rightInput.value = batch.prompt
  formActions.setFieldsValue({
    model: {
      modelId: batch.model,
      providerId: batch.providerId
    },
    size: batch.size,
    n: batch.n,
    seed: batch.seed,
    providerOptions: batch.params?.providerOptions
  })
  if (batch.providerId) {
    dynamicField.value = getDynamicFields(batch.providerId, batch.mediaType === 'video')
  }
  // 恢复参考图片
  if (batch.referenceImages && batch.referenceImages.length > 0) {
    referenceImages.value = [...batch.referenceImages]
  }
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
  if (settingsStore.imageGenerationForm?.model.providerId) {
    const category = getModelCategory(settingsStore.imageGenerationForm.model.providerId, settingsStore.imageGenerationForm.model.modelId)
    isVideoMode.value = (category as string) === 'video'
    dynamicField.value = getDynamicFields(settingsStore.imageGenerationForm.model.providerId, isVideoMode.value)
  }

  const initialForm = isVideoMode.value ? settingsStore.videoGenerationForm : settingsStore.imageGenerationForm
  if (initialForm) {
    formActions.setData(initialForm)
    if (initialForm.prompt) {
      rightInput.value = initialForm.prompt
      initialForm.prompt = ''
    }
  }

  textareaRef.value?.focus()
  // 恢复未完成的任务
  generatedBatches.value.forEach(batch => {
    if (activeProcessingIds.has(batch.id)) return
    if (batch.taskId && batch.status !== 'completed') {
      resumeGeneration(batch)
    }
  })
})
</script>

<template>
  <div class="image-page-container">
    <ResizeBox v-model:width="settingsStore.display.imageSidebarWidth"
      v-model:is-collapsed="settingsStore.display.sidebarCollapsed" :min-size="250" :max-size="500">
      <FormContainer :show-header="false" class="form-section">
        <template #content>
          <ImageForm>
          </ImageForm>
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
              <Card v-for="{ data: batch } in virtualList" :key="batch.id" padding="20px" radius="16px"
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
                  <div v-for="(img, index) in batch.images" :key="index" class="image-item"
                    :class="{ 'video-item': batch.mediaType === 'video' }">
                    <template v-if="typeof img === 'object' && img.loading">
                      <div class="image-loading" :class="{ 'is-failed': batch.status === 'failed' }">
                        <template v-if="batch.status === 'failed'">
                          <div class="error-icon">
                            <X />
                          </div>
                          <span class="error-text">生成失败</span>
                          <p v-if="batch.error" class="error-detail">{{ batch.error }}</p>
                        </template>
                        <template v-else>
                          <div class="loading-spinner"></div>
                          <span>{{ batch.mediaType === 'video' ? '视频生成中...' : '生成中...' }}</span>
                        </template>
                      </div>
                    </template>
                    <template v-else>
                      <!-- 视频显示 -->
                      <template v-if="batch.mediaType === 'video'">
                        <video :src="(img as string)" controls preload="metadata" class="video-player" @click.stop />
                      </template>
                      <!-- 图片显示 -->
                      <template v-else>
                        <Image :src="(img as string)" preview
                          :images="(batch.images.filter(i => typeof i === 'string') as string[])"
                          :initial-index="batch.images.filter((i, idx) => typeof i === 'string' && idx <= index).length - 1" />
                      </template>
                    </template>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div class="floating-input-area">
            <Card class="input-box-wrapper" :class="{ disabled: !isModelSelected }" radius="24px" padding="8px 16px">
              <!-- 参考图片预览 -->
              <div v-if="referenceImages.length > 0" class="reference-images-section">
                <FileUpload ref="fileUploadRef" v-model="referenceImages" :multiple="true" :removable="true"
                  :show-upload="true" @remove="(index) => referenceImages.splice(index, 1)" />
              </div>

              <div class="input-top">
                <div class="textarea-wrapper">
                  <Button variant="text" size="sm" class="reference-image-btn" title="添加参考图片"
                    :disabled="!isModelSelected" @click="handleAddReferenceImage">
                    <Plus />
                  </Button>
                  <textarea ref="textareaRef" v-model="rightInput"
                    :placeholder="isModelSelected ? '说说今天想做点什么' : '请先选择生成模型'"
                    :disabled="!isModelSelected || isOptimizing" @keydown.enter.exact.prevent="handleRightInputSubmit"
                    rows="1" @input="handleInput"></textarea>
                  <Button v-if="rightInput && !isOptimizing" variant="text" size="sm" class="clear-btn"
                    @click="rightInput = ''">
                    <X />
                  </Button>
                </div>

                <div class="input-actions">
                  <ModelSelector v-model:modelId="optimizeModelId" v-model:providerId="optimizeProviderId"
                    popup-position="top" type="icon" category="text" class="optimize-model-selector"
                    @update:model-id="(id) => handleOptimizeModelChange({ modelId: id, providerId: optimizeProviderId })"
                    @update:provider-id="(id) => handleOptimizeModelChange({ modelId: optimizeModelId, providerId: id })" />
                  <Button v-if="rightInput || isOptimizing" variant="text" size="sm" class="optimize-btn" title="优化提示词"
                    :loading="isOptimizing" @click="() => optimizePrompt()">
                    <Bulb />
                  </Button>
                  <Button variant="primary" size="sm" class="send-btn"
                    :disabled="!isModelSelected || !rightInput.trim() || isOptimizing" @click="handleRightInputSubmit">
                    <template #icon>
                      <Send style="font-size: 13px;" />
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
  width: 100%;
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
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
  scroll-behavior: smooth;
  padding-bottom: 100px;
  height: 100% !important;
}

.results-content>div {
  max-width: 1000px;
  margin: 0 auto;
}

.batches-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 32px;
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
  min-width: 0;
  overflow: hidden;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
}

.image-grid::-webkit-scrollbar {
  height: 6px;
}

.image-grid::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

.image-grid::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.image-grid::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.image-item {
  position: relative;
  flex-shrink: 0;
  width: 140px;
  height: 140px;
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

.video-item {
  width: 240px;
  height: 135px;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
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
  background: var(--bg-tertiary);
}

.image-loading.is-failed {
  color: var(--color-error);
  padding: 16px;
  text-align: center;
}

.error-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--color-error-rgb), 0.1);
  margin-bottom: 4px;
}

.error-text {
  font-weight: 600;
}

.error-detail {
  font-size: 11px;
  opacity: 0.8;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 4px;
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

.reference-images-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  padding-left: 4px;
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
