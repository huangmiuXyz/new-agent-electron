<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import { useSettingsStore } from '@renderer/stores/settings'
import { acquireZIndex } from '@renderer/utils/z-index-manager'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import { useAudioStore } from '@renderer/stores/audio'
import { useImageGeneration } from '@renderer/composables/useImageGeneration'
import GenerationResultCard from './GenerationResultCard.vue'
import SpeechResultPanel from './SpeechResultPanel.vue'
import FloatingInputArea from './FloatingInputArea.vue'
import ImageModePanel from './panels/ImageModePanel.vue'
import VideoModePanel from './panels/VideoModePanel.vue'
import SpeechModePanel from './panels/SpeechModePanel.vue'

interface ImageMetadata {
  chatId: string
  providerId: string
  task_ids?: string[]
  finished_task_ids?: string[]
  images?: string[]
  config?: {
    model: string
    size?: string
    n: number
    seed?: number
    duration?: number
    resolution?: `${number}x${number}`
    mediaType?: 'image' | 'video'
    providerOptions?: Record<string, any>
  }
}

interface ToolOutput {
  metadata?: ImageMetadata
  error?: string
}

type GenerationMode = 'image' | 'video' | 'speech'

const props = defineProps<{
  args?: Record<string, any>
  result?: ToolOutput
  message?: any
  tool_part?: any
}>()

const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const audioStore = useAudioStore()
const { setTitle, resetTitle } = useAppHeader()
const { confirm } = useModal()
const { generatedBatches, startGeneration, resumeGeneration, createImageBatch } = useImageGeneration()
const router = useRouter()
const route = useRoute()

const activeMode = ref<GenerationMode>('image')
const isImageMode = computed(() => activeMode.value === 'image')
const isVideoMode = computed(() => activeMode.value === 'video')
const isSpeechMode = computed(() => activeMode.value === 'speech')

const isRegenerating = ref(false)
const isToolMode = computed(() => !!props.tool_part)
const REGENERATE_MIN_LOCK_MS = 1500
const IMAGE_PAGE_SPEECH_PREFIX = 'image-page-speech:'

const imagePanelRef = ref<InstanceType<typeof ImageModePanel>>()
const videoPanelRef = ref<InstanceType<typeof VideoModePanel>>()
const speechPanelRef = ref<InstanceType<typeof SpeechModePanel>>()
const rightInput = ref('')
const resultsContentRef = ref<HTMLElement>()
const floatingInputRef = ref<InstanceType<typeof FloatingInputArea>>()

const showSidebar = ref(false)
const sidebarOverlayZIndex = acquireZIndex()
const toggleSidebar = () => {
  showSidebar.value = !showSidebar.value
}
provide('toggleImageSidebar', toggleSidebar)

const isMobileImagePage = computed(() => isMobile.value && !isToolMode.value && route.path.startsWith('/mobile/image'))
const mobileRouteMode = computed<GenerationMode | null>(() => {
  const mode = route.params.mode
  if (mode === 'image' || mode === 'video' || mode === 'speech') {
    return mode
  }

  return null
})

useBackButton({
  enabled: isMobileImagePage,
  handler: () => {
    const previousRoute = window.history.state?.back
    if (typeof previousRoute === 'string' && previousRoute.length > 0) {
      router.back()
    } else {
      router.replace('/mobile/chat/list')
    }
    return true
  }
})

const normalizeImages = (images: any[] = []) =>
  images
    .map((img: any) => {
      if (typeof img === 'string') return img
      if (img.base64) {
        return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
      }
      return img.url || ''
    })
    .filter(Boolean) as string[]

const normalizeVideos = (videos: any[] = []) =>
  videos
    .map((video: any) => {
      if (typeof video === 'string') return video
      if (video.base64) {
        return video.base64.startsWith('data:') ? video.base64 : `data:video/mp4;base64,${video.base64}`
      }
      return video.url || ''
    })
    .filter(Boolean) as string[]

const fallbackToolBatchId = ref(Date.now())
const toolBatchId = computed(() => {
  const rawToolCallId = props.tool_part?.toolCallId
  if (!rawToolCallId) return fallbackToolBatchId.value

  const parsed = Number(String(rawToolCallId).replace(/\D/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackToolBatchId.value
})

const displayBatches = computed(() => {
  if (!isToolMode.value) {
    if (isSpeechMode.value) return []
    const targetMediaType = isVideoMode.value ? 'video' : 'image'
    return generatedBatches.value.filter((batch) => (batch.mediaType || 'image') === targetMediaType)
  }
  return generatedBatches.value.filter((batch) => batch.id === toolBatchId.value)
})

const getBatchEstimatedHeight = (index: number) => {
  const batch = displayBatches.value[index]
  if (!batch) return 320

  const hasReferenceImages = (batch.referenceImages?.length || 0) > 0
  const isVideoBatch = batch.mediaType === 'video'
  const isFailedBatch = batch.status === 'failed'

  if (isVideoBatch) return hasReferenceImages ? 420 : 390
  if (isFailedBatch) return hasReferenceImages ? 380 : 350
  return hasReferenceImages ? 360 : 320
}

const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(displayBatches, {
  itemHeight: getBatchEstimatedHeight,
  overscan: 2
})

const setResultsContentRefs = (el: Element | ComponentPublicInstance | null) => {
  const element = el as HTMLElement | null
  resultsContentRef.value = element || undefined

  const virtualListContainerRef = containerProps.ref as Ref<HTMLElement | null>
  virtualListContainerRef.value = element
}

const renderedBatches = computed(() => {
  if (isToolMode.value) {
    return displayBatches.value.map((batch) => ({ data: batch }))
  }
  return virtualList.value
})

const renderedWrapperProps = computed(() => {
  if (isToolMode.value) return {}
  return wrapperProps.value
})

const previewImageGallery = computed(() =>
  displayBatches.value
    .filter((batch) => (batch.mediaType || 'image') === 'image')
    .flatMap((batch) => batch.images.filter((img) => typeof img === 'string') as string[])
)

const getBatchPreviewImageOffset = (batchId: number) => {
  let offset = 0
  for (const batch of displayBatches.value) {
    if (batch.id === batchId) return offset
    if ((batch.mediaType || 'image') === 'image') {
      offset += batch.images.filter((img) => typeof img === 'string').length
    }
  }

  return 0
}

const speechResults = computed(() =>
  audioStore.generatedBatches
    .filter((chunk) => chunk.messageId?.startsWith(IMAGE_PAGE_SPEECH_PREFIX))
    .slice()
    .reverse()
)

const isModelSelected = computed(() => {
  if (isSpeechMode.value) return speechPanelRef.value?.hasModelSelected() ?? false
  if (isVideoMode.value) return videoPanelRef.value?.hasModelSelected() ?? false
  return imagePanelRef.value?.hasModelSelected() ?? false
})

const handleModeSwitch = (mode: GenerationMode) => {
  if (isMobile.value && !isToolMode.value && mobileRouteMode.value) {
    router.replace(`/mobile/image/${mode}`)
  }

  activeMode.value = mode
}

const scrollToLatestSpeech = () => {
  nextTick(() => {
    resultsContentRef.value?.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  })
}

const scrollToBottom = () => {
  nextTick(() => {
    if (isSpeechMode.value) {
      scrollToLatestSpeech()
      return
    }

    if (displayBatches.value.length > 0) {
      scrollTo(displayBatches.value.length - 1)
    }
  })
}

const syncToolBatchFromResult = () => {
  if (!isToolMode.value) return

  const metadata = props.result?.metadata
  const resultError = props.result?.error
  const prompt = props.args?.prompt || ''
  const batchId = toolBatchId.value
  const existing = generatedBatches.value.find((batch) => batch.id === batchId)
  const toolState = props.tool_part?.state
  const hasFinalToolState = ['output-available', 'output-error', 'output-denied'].includes(toolState)
  const isAwaitingToolOutput = !props.result && !hasFinalToolState
  const toolName = props.tool_part?.toolName || String(props.tool_part?.type || '').replace(/^tool-/, '')
  const isVideoTool = toolName === 'video_generator'
  const fallbackForm = isVideoTool ? settingsStore.videoGenerationForm : settingsStore.imageGenerationForm
  const mediaType = metadata?.config?.mediaType === 'video' || isVideoTool ? 'video' : 'image'
  const fallbackModel = fallbackForm?.model?.modelId || ''
  const fallbackProviderId = fallbackForm?.model?.providerId
  const modelId = metadata?.config?.model || fallbackModel
  const providerId = metadata?.providerId || fallbackProviderId
  const modelName = providerId && modelId
    ? settingsStore.getModelById(providerId, modelId).model?.name || modelId
    : undefined
  const fallbackN = fallbackForm?.n || 1
  const fallbackSize = !isVideoTool ? settingsStore.imageGenerationForm?.size : undefined
  const fallbackSeed = fallbackForm?.seed || undefined
  const fallbackProviderOptions = fallbackForm?.providerOptions

  const normalizedMedia = mediaType === 'video'
    ? normalizeVideos(metadata?.images || [])
    : normalizeImages(metadata?.images || [])
  const finishedTaskIds = metadata?.finished_task_ids || []
  const taskIds = metadata?.task_ids || []
  const pendingTaskId = taskIds.find((id) => !finishedTaskIds.includes(id))
  const hasPendingTask = !!pendingTaskId
  const n = metadata?.config?.n || fallbackN || Math.max(normalizedMedia.length, 1)
  const shouldShowPlaceholders = hasPendingTask || isAwaitingToolOutput
  const placeholders = shouldShowPlaceholders
    ? Array.from({ length: Math.max(1, n - normalizedMedia.length) }, (_v, idx) => ({ loading: true, id: idx + 1 }))
    : []

  const batchData: Partial<ImageBatch> = {
    prompt,
    model: modelId,
    modelName,
    size: metadata?.config?.size || fallbackSize,
    n,
    providerId,
    images: [...normalizedMedia, ...placeholders],
    taskId: pendingTaskId,
    status: shouldShowPlaceholders ? 'processing' : resultError ? 'failed' : 'completed',
    error: resultError,
    seed: metadata?.config?.seed || fallbackSeed,
    params: { providerOptions: metadata?.config?.providerOptions || fallbackProviderOptions },
    mediaType,
    duration: mediaType === 'video' ? metadata?.config?.duration : undefined,
    resolution: mediaType === 'video' ? metadata?.config?.resolution : undefined
  }

  if (existing) {
    imgStore.updateBatch(batchId, batchData)
  } else {
    imgStore.addBatch({
      id: batchId,
      prompt: prompt || '',
      model: modelId,
      modelName,
      n,
      images: [...normalizedMedia, ...placeholders],
      providerId,
      taskId: pendingTaskId,
      status: shouldShowPlaceholders ? 'processing' : resultError ? 'failed' : 'completed',
      error: resultError,
      size: metadata?.config?.size || fallbackSize,
      seed: metadata?.config?.seed || fallbackSeed,
      params: { providerOptions: metadata?.config?.providerOptions || fallbackProviderOptions },
      mediaType,
      duration: mediaType === 'video' ? metadata?.config?.duration : undefined,
      resolution: mediaType === 'video' ? metadata?.config?.resolution : undefined
    })
  }

  const latest = generatedBatches.value.find((batch) => batch.id === batchId)
  if (latest && latest.taskId && latest.status !== 'completed') {
    resumeGeneration(latest)
  }
}

const handleRegenerate = async () => {
  if (!isToolMode.value || isRegenerating.value) return

  const metadata = props.result?.metadata
  if (!metadata || !metadata.config || !metadata.providerId) return

  isRegenerating.value = true
  try {
    const batchId = toolBatchId.value
    const existing = generatedBatches.value.find((batch) => batch.id === batchId)
    const placeholder = { loading: true as const, id: Date.now() }

    const regenBatch = createImageBatch({
      prompt: props.args?.prompt || '',
      model: metadata.config.model,
      providerId: metadata.providerId,
      size: metadata.config.size,
      n: 1,
      seed: metadata.config.seed,
      providerOptions: metadata.config.providerOptions
    })
    regenBatch.id = batchId
    regenBatch.images = [placeholder]
    regenBatch.error = undefined

    if (existing) {
      imgStore.updateBatch(batchId, {
        prompt: regenBatch.prompt,
        model: regenBatch.model,
        providerId: regenBatch.providerId,
        size: regenBatch.size,
        seed: regenBatch.seed,
        params: regenBatch.params,
        mediaType: 'image',
        status: 'pending',
        error: undefined,
        n: (existing.n || 0) + 1,
        images: [...existing.images, placeholder]
      })
    } else {
      imgStore.addBatch(regenBatch)
    }

    await Promise.all([
      startGeneration(regenBatch),
      new Promise((resolve) => setTimeout(resolve, REGENERATE_MIN_LOCK_MS))
    ])
  } catch (error) {
    const e = error as Error
    console.error('Regeneration failed:', e)
    imgStore.updateBatch(toolBatchId.value, {
      status: 'failed',
      error: e.message
    })
  } finally {
    isRegenerating.value = false
  }
}

const copyPrompt = (prompt: string) => {
  copyText(prompt)
}

const clearResults = async () => {
  const isSpeech = isSpeechMode.value
  const hasResults = isSpeech ? speechResults.value.length > 0 : displayBatches.value.length > 0
  if (!hasResults) return

  const confirmed = await confirm({
    title: isSpeech ? '清空语音结果' : '清空生成结果',
    content: isSpeech ? '确定要清空全部语音生成内容吗？此操作不可撤销。' : '确定要清空全部生成内容吗？此操作不可撤销。',
    confirmProps: {
      danger: true
    }
  })
  if (!confirmed) return

  if (isSpeech) {
    audioStore.clearBatches()
    return
  }
  const targetMediaType = isVideoMode.value ? 'video' : 'image'
  generatedBatches.value
    .filter((batch) => (batch.mediaType || 'image') === targetMediaType)
    .forEach((batch) => imgStore.removeBatch(batch.id))
}

const removeSpeechResult = async (chunkId: string) => {
  const confirmed = await confirm({
    title: '删除语音结果',
    content: '确定要删除这条生成内容吗？此操作不可撤销。',
    confirmProps: {
      danger: true
    }
  })
  if (!confirmed) return

  audioStore.removeBatch(chunkId)
}

const reEditSpeech = async (chunk: any) => {
  rightInput.value = chunk.prompt
  activeMode.value = 'speech'
  await nextTick()
  speechPanelRef.value?.restoreFromBatch?.(chunk)
}

const regenerateSpeech = async (chunk: any) => {
  activeMode.value = 'speech'
  await nextTick()
  speechPanelRef.value?.restoreFromBatch?.(chunk)
  const submitPromise = speechPanelRef.value?.submit(
    chunk.prompt,
    `${IMAGE_PAGE_SPEECH_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chunk.id
  )
  scrollToLatestSpeech()
  await submitPromise
}

const reEdit = (batch: ImageBatch) => {
  rightInput.value = batch.prompt
  activeMode.value = batch.mediaType === 'video' ? 'video' : 'image'

  if (batch.mediaType === 'video') {
    videoPanelRef.value?.restoreFromBatch(batch)
  } else {
    imagePanelRef.value?.restoreFromBatch(batch)
  }

  if (batch.referenceImages && batch.referenceImages.length > 0 && floatingInputRef.value) {
    floatingInputRef.value.referenceImages = [...batch.referenceImages]
  }
}

const deleteBatch = async (batchId: number) => {
  const confirmed = await confirm({
    title: '删除生成结果',
    content: '确定要删除这条生成内容吗？此操作不可撤销。',
    confirmProps: {
      danger: true
    }
  })
  if (!confirmed) return

  imgStore.removeBatch(batchId)
}

const handleRightInputSubmit = async () => {
  const prompt = rightInput.value.trim()
  if (!prompt) return

  const referenceImages = floatingInputRef.value?.referenceImages || []
  let submitPromise: Promise<unknown> | undefined

  if (isSpeechMode.value) {
    submitPromise = speechPanelRef.value?.submit(
      prompt,
      `${IMAGE_PAGE_SPEECH_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    )
  } else if (isVideoMode.value) {
    submitPromise = videoPanelRef.value?.submit(prompt, referenceImages)
  } else {
    submitPromise = imagePanelRef.value?.submit(prompt, referenceImages)
  }

  rightInput.value = ''
  floatingInputRef.value?.clearInput()
  floatingInputRef.value?.clearReferenceImages()
  scrollToBottom()
  await submitPromise
}

onMounted(() => {
  if (isMobile.value && !isToolMode.value) {
    setTitle('创作')
  }

  if (isToolMode.value) return

  if (settingsStore.imageGenerationForm?.prompt) {
    rightInput.value = settingsStore.imageGenerationForm.prompt
  }

  generatedBatches.value.forEach((batch) => {
    if (batch.taskId && batch.status !== 'completed') {
      resumeGeneration(batch)
    }
  })
})

onUnmounted(() => {
  if (isMobile.value && !isToolMode.value) {
    resetTitle()
  }
})

watch(
  mobileRouteMode,
  (mode) => {
    if (!mode) return

    activeMode.value = mode
  },
  { immediate: true }
)

const toolResultSyncKey = computed(() => {
  const metadata = props.result?.metadata
  const images = metadata?.images || []
  const imageSizeSignature = images
    .map((img: any) => {
      if (typeof img === 'string') return `s:${img.length}`
      if (img?.base64) return `b:${String(img.base64).length}`
      if (img?.url) return `u:${String(img.url).length}`
      return 'x:0'
    })
    .join(',')

  return [
    props.tool_part?.toolCallId || '',
    props.args?.prompt || '',
    props.result?.error || '',
    props.tool_part?.state || '',
    metadata?.providerId || '',
    metadata?.config?.mediaType || '',
    metadata?.config?.model || '',
    metadata?.config?.size || '',
    metadata?.config?.n || 0,
    metadata?.task_ids?.join(',') || '',
    metadata?.finished_task_ids?.join(',') || '',
    imageSizeSignature
  ].join('|')
})

watch(toolResultSyncKey, () => {
  syncToolBatchFromResult()
}, { immediate: true })

const { Trash, Image: ImageIcon, Screen, VolumeMedium, X } = useIcon([
  'Trash',
  'Image',
  'Screen',
  'VolumeMedium',
  'X'
])
</script>

<template>
  <div class="image-page-container" :class="{ 'tool-mode': isToolMode, 'is-mobile': isMobile }">
    <AppHeader v-if="isMobile && !isToolMode" :current-view="'image'" mode="detail" />
    <Teleport v-if="!isToolMode && !isMobile" defer to="#global-left-panel-content">
      <FormContainer :show-header="false" class="form-section">
        <template #content>
          <div class="mode-switcher">
            <div class="mode-tab" :class="{ active: isImageMode }" @click="handleModeSwitch('image')">
              <ImageIcon />
              <span>图片</span>
            </div>
            <div class="mode-tab" :class="{ active: isVideoMode }" @click="handleModeSwitch('video')">
              <Screen />
              <span>视频</span>
            </div>
            <div class="mode-tab" :class="{ active: isSpeechMode }" @click="handleModeSwitch('speech')">
              <VolumeMedium />
              <span>声音</span>
            </div>
          </div>

          <SpeechModePanel v-if="isSpeechMode" ref="speechPanelRef" />
          <VideoModePanel v-else-if="isVideoMode" ref="videoPanelRef" />
          <ImageModePanel v-else ref="imagePanelRef" />
        </template>
      </FormContainer>
    </Teleport>

    <!-- Mobile Sidebar Drawer -->
    <div v-if="isMobile && !isToolMode" class="mobile-sidebar-overlay" :style="{ zIndex: sidebarOverlayZIndex }" :class="{ active: showSidebar }" @click="showSidebar = false">
      <div class="mobile-sidebar" :class="{ active: showSidebar }" @click.stop>
        <div class="mobile-sidebar-header">
          <span>模型配置</span>
          <Button variant="text" size="sm" @click="showSidebar = false">
            <X />
          </Button>
        </div>
        <div class="mobile-sidebar-content">
          <div class="mode-switcher">
            <div class="mode-tab" :class="{ active: isImageMode }" @click="handleModeSwitch('image')">
              <ImageIcon />
              <span>图片</span>
            </div>
            <div class="mode-tab" :class="{ active: isVideoMode }" @click="handleModeSwitch('video')">
              <Screen />
              <span>视频</span>
            </div>
            <div class="mode-tab" :class="{ active: isSpeechMode }" @click="handleModeSwitch('speech')">
              <VolumeMedium />
              <span>声音</span>
            </div>
          </div>

          <SpeechModePanel v-if="isSpeechMode" ref="speechPanelRef" />
          <VideoModePanel v-else-if="isVideoMode" ref="videoPanelRef" />
          <ImageModePanel v-else ref="imagePanelRef" />
        </div>
      </div>
    </div>

    <FormContainer class="results-section" :show-header="!isMobile" no-padding>
      <template #header>
        <div class="header-left">
          <span>生成结果</span>
        </div>
        <div class="header-actions">
          <Button v-if="isToolMode" size="sm" :loading="isRegenerating" @click="handleRegenerate">
            {{ isRegenerating ? '重新生成中...' : '重新生成' }}
          </Button>
          <Button
            v-else-if="(isSpeechMode ? speechResults.length : generatedBatches.length) > 0"
            variant="text"
            size="sm"
            @click="clearResults"
          >
            <template #icon>
              <Trash />
            </template>
            清空结果
          </Button>
        </div>
      </template>

      <template #content>
        <div class="results-container">
          <div class="results-content" v-bind="{ ...containerProps, ref: undefined }" :ref="setResultsContentRefs">
            <div v-if="isSpeechMode">
              <div v-if="speechResults.length === 0" class="empty-state">
                <div class="empty-icon">
                  <VolumeMedium />
                </div>
                <p>在下方输入文本，生成可播放的声音内容</p>
              </div>
              <div v-else class="speech-results-list">
                <SpeechResultPanel
                  v-for="chunk in speechResults"
                  :key="chunk.id"
                  :chunk="chunk"
                  @copy-prompt="copyPrompt"
                  @remove="removeSpeechResult"
                  @re-edit="reEditSpeech"
                  @regenerate="regenerateSpeech"
                />
              </div>
            </div>
            <div v-else-if="displayBatches.length === 0" class="empty-state">
              <div class="empty-icon">
                <ImageIcon />
              </div>
              <p>{{ isToolMode ? '等待生成结果...' : '在下方输入提示词，开始你的创作?' }}</p>
            </div>
            <div v-else class="batches-list" v-bind="renderedWrapperProps">
              <GenerationResultCard
                v-for="{ data: batch } in renderedBatches"
                :key="batch.id"
                :batch="batch"
                :readonly="isToolMode"
                :preview-images="previewImageGallery"
                :preview-image-offset="getBatchPreviewImageOffset(batch.id)"
                @re-edit="reEdit"
                @delete="deleteBatch"
                @copy-prompt="copyPrompt"
              />
            </div>
          </div>

          <FloatingInputArea
            v-if="!isToolMode"
            ref="floatingInputRef"
            v-model:input="rightInput"
            :is-model-selected="isModelSelected"
            :show-reference-upload="!isSpeechMode"
            @submit="handleRightInputSubmit"
          />
        </div>
      </template>
    </FormContainer>

  </div>
</template>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.sidebar-toggle-btn {
  margin-left: -8px;
  color: var(--text-secondary);
}

.image-page-container {
  display: flex;
  height: 100%;
  width: 100%;
}

/* Mobile Sidebar Styles */
.mobile-sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
}

.mobile-sidebar-overlay.active {
  opacity: 1;
  visibility: visible;
}

.mobile-sidebar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: min(320px, 85vw);
  background: var(--bg-card);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  box-shadow: 12px 0 32px rgba(0, 0, 0, 0.15);
}

.mobile-sidebar.active {
  transform: translateX(0);
}

.mobile-sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
}

.mobile-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.image-page-container.is-mobile {
  flex-direction: column;
}

.image-page-container.is-mobile .results-section {
  flex: 1;
  overflow: hidden;
}

.image-page-container.is-mobile .results-content {
  padding: 12px;
  padding-bottom: calc(96px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
}

.image-page-container.is-mobile .batches-list {
  gap: 16px;
}

.image-page-container.tool-mode {
  height: auto;
}

.image-page-container.tool-mode .results-content {
  padding: 8px;
  padding-bottom: 8px;
}

.image-page-container.tool-mode .batches-list {
  padding-bottom: 0;
}

.form-section {
  width: 100%;
  border-right: 1px solid var(--sidebar-border);
  height: 100%;
}

.form-section :deep(.form-item) {
  margin-bottom: 8px;
}

.form-section :deep(.form-item[data-size="sm"]) {
  margin-bottom: 4px;
  margin-top: 4px;
}

.form-section :deep(.form-item[data-layout="toggle"]) {
  padding: 8px 0;
}

.form-section :deep(.form-group-title) {
  padding-bottom: 4px;
}

.form-section :deep(.form-group-children) {
  margin-top: 6px;
}

.mode-switcher {
  display: flex;
  padding: 3px;
  gap: 2px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-bottom: 4px;
  container-type: inline-size;
}

@container (max-width: 175px) {
  .mode-tab span {
    display: none;
  }
  .mode-tab {
    gap: 0;
  }
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
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
  scroll-behavior: smooth;
  padding-bottom: 88px;
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

.speech-results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
