<script setup lang="ts">
import { createRegistry, ProviderV3Extends } from '@renderer/services/chatService/registry'

interface ImageMetadata {
  chatId: string
  providerId: string
  task_ids?: string[]
  finished_task_ids?: string[]
  config?: {
    model: string
    size: string
    n: number
    seed?: number
    providerOptions?: Record<string, any>
  }
}

interface ToolOutput {
  images?: string[]
  image_metadata?: ImageMetadata
  error?: string
}

const props = defineProps<{
  args?: Record<string, any>
  result?: ToolOutput
  message: any
  tool_part: any
}>()

const localResult = ref<ToolOutput | null>(null)
const isPolling = ref(false)
const isRegenerating = ref(false)
const abortController = new AbortController()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()

const getProviderInstance = (providerId: string): ProviderV3Extends => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) throw new Error('未找到所选模型的提供商')

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  return registry.getProvider(provider.providerType)
}

const pollStatus = async () => {
  if (isPolling.value) return

  isPolling.value = true
  try {
    const metadata = props.tool_part?.output?.image_metadata as ImageMetadata | undefined
    if (!metadata) return

    const providerInstance = getProviderInstance(metadata.providerId)
    if (!providerInstance.asyncResult) {
      throw new Error('提供商不支持异步任务查询')
    }

    let finishedCount = 0
    const cid = props.message?.metadata?.cid || props.tool_part?.output?.image_metadata?.chatId
    const mid = props.message?.id
    const toolCallId = props.tool_part?.toolCallId

    while (true) {
      const chat = chatsStore.getChatById(cid)
      const msg = chat?.messages.find((m: any) => m.id === mid)

      let currentMetadata: any = null
      if (msg && msg.parts) {
        const part = msg.parts.find((p: any) => p.toolCallId === toolCallId) as any
        currentMetadata = part?.output?.image_metadata
      }

      if (!currentMetadata) {
        currentMetadata = props.tool_part?.output?.image_metadata
      }

      const taskIds = currentMetadata?.task_ids || []
      const finishedTaskIds = currentMetadata?.finished_task_ids || []
      const nextIndex = Math.max(finishedCount, finishedTaskIds.length)

      if (nextIndex >= taskIds.length) {
        break
      }

      const taskId = taskIds[nextIndex]
      let success = false
      let resultImages: string[] = []

      try {
        const result = await providerInstance.asyncResult({ task_id: taskId })

        resultImages = (result.images || [])
          .map((img: any) => {
            if (typeof img === 'string') return img
            if (img.base64)
              return img.base64.startsWith('data:')
                ? img.base64
                : `data:image/png;base64,${img.base64}`
            return img.url || ''
          })
          .filter(Boolean) as string[]
        success = true
      } catch (pollError: any) {
        console.error(`Task ${taskId} failed:`, pollError)
        localResult.value = { ...localResult.value, error: pollError.message }
      }

      if (cid && mid && toolCallId) {
        const chat = chatsStore.getChatById(cid)
        const msg = chat?.messages.find((m: any) => m.id === mid)
        if (msg && msg.parts) {
          const partIndex = msg.parts.findIndex((p: any) => p.toolCallId === toolCallId)
          if (partIndex !== -1) {
            const latestPart = msg.parts[partIndex] as any
            const latestOutput = latestPart.output || {}
            const latestMetadata = latestOutput.image_metadata || currentMetadata
            const latestImages = latestOutput.images || []

            const updatedImages = success ? [...latestImages, ...resultImages] : latestImages
            const updatedFinishedTaskIds = [...(latestMetadata.finished_task_ids || []), taskId]

            const updatedMetadata = {
              ...latestMetadata,
              finished_task_ids: updatedFinishedTaskIds
            }

            const newParts = [...msg.parts]
            newParts[partIndex] = {
              ...latestPart,
              output: {
                ...latestOutput,
                images: updatedImages,
                image_metadata: updatedMetadata,
                toolResult: {
                  content: [{ type: 'text', text: `<|stop|>图片生成成功！` }]
                }
              }
            }

            chatsStore.updateMessage(cid, mid, newParts)
            localResult.value = { ...localResult.value, images: updatedImages }
          }
        }
      }
      finishedCount = nextIndex + 1
    }
  } catch (error) {
    const e = error as Error
    console.error('Image polling error:', e)
    localResult.value = { ...localResult.value, error: e.message }
  } finally {
    isPolling.value = false
  }
}

const handleRegenerate = async () => {
  if (isRegenerating.value) return

  const metadata = props.tool_part?.output?.image_metadata as ImageMetadata | undefined
  if (!metadata || !metadata.config) return

  isRegenerating.value = true
  try {
    const provider = settingsStore.getProviderById(metadata.providerId)
    if (!provider) throw new Error('未找到提供商')

    const registry = createRegistry({
      apiKey: provider.apiKey || '',
      baseURL: provider.baseUrl,
      name: provider.name
    })
    const providerInstance = registry.getProvider(provider.providerType)

    let task_id: string | undefined
    const prompt = props.args?.prompt || ''

    if (providerInstance && 'generateImageAsyncTask' in providerInstance) {
      const result = await (providerInstance as any).generateImageAsyncTask({
        model: (providerInstance as any).imageModel(metadata.config.model),
        prompt,
        size: metadata.config.size as `${number}x${number}`,
        n: metadata.config.n || 1,
        providerOptions: {
          [provider.providerType]: metadata.config.providerOptions?.[provider.providerType]
        }
      })
      task_id = result.task_id
    }

    if (task_id) {
      const cid = metadata.chatId
      const mid = props.message?.id
      const toolCallId = props.tool_part?.toolCallId

      if (cid && mid && toolCallId) {
        const chat = chatsStore.getChatById(cid)
        const msg = chat?.messages.find((m: any) => m.id === mid)
        if (msg && msg.parts) {
          const partIndex = msg.parts.findIndex((p: any) => p.toolCallId === toolCallId)
          if (partIndex !== -1) {
            const latestPart = msg.parts[partIndex] as any
            const newParts = [...msg.parts]
            const currentOutput = (latestPart.output || {}) as ToolOutput
            const currentMetadata = (currentOutput.image_metadata || {}) as ImageMetadata
            const updatedTaskIds = [...(currentMetadata.task_ids || []), task_id]

            newParts[partIndex] = {
              ...latestPart,
              output: {
                ...currentOutput,
                image_metadata: {
                  ...currentMetadata,
                  task_ids: updatedTaskIds
                }
              }
            }
            chatsStore.updateMessage(cid, mid, newParts)
          }
        }
      }
    }
  } catch (error) {
    const e = error as Error
    console.error('Regeneration failed:', e)
    localResult.value = { ...localResult.value, error: e.message }
  } finally {
    isRegenerating.value = false
  }
}

watch(
  () => props.tool_part?.output?.image_metadata?.task_ids?.length,
  (newLen) => {
    if (newLen > 0) pollStatus()
  },
  { immediate: true }
)

onUnmounted(() => {
  abortController.abort()
})

const images = computed(() => props.result?.images || localResult.value?.images || [])
const error = computed(() => props.result?.error || localResult.value?.error)
const prompt = computed(() => props.args?.prompt)
</script>

<template>
  <div class="builtin-image-render" style="display: flex; flex-direction: column; gap: 12px; padding: 8px;">
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
        <div v-if="prompt" style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
          <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
            提示词:
          </span>
          {{ prompt }}
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <Button size="sm" :loading="isRegenerating" @click="handleRegenerate">
          {{ isRegenerating ? '重新生成中...' : '重新生成' }}
        </Button>
      </div>
    </div>

    <div v-if="error"
      style="padding: 10px; color: var(--color-error); background: var(--bg-card-soft); border-left: 3px solid var(--color-error); border-radius: 4px; font-size: 12px;">
      <div style="font-weight: 600; margin-bottom: 2px;">生成失败</div>
      <div style="opacity: 0.9;">{{ error }}</div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
      <div v-for="(src, index) in images" :key="index"
        style="position: relative; border-radius: 8px; overflow: hidden; background: var(--bg-card-soft); aspect-ratio: 1/1;">
        <Image :src="src" :preview="true" :images="images" :initial-index="index"
          style="width: 100%; height: 100%; object-fit: cover;" />
      </div>
      <div v-if="isPolling"
        style="border-radius: 8px; overflow: hidden; background: var(--bg-card-soft); aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center;">
        <div
          style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 12px;">
          <Loading size="small" />
          <span>生成中...</span>
        </div>
      </div>
    </div>
  </div>
</template>
