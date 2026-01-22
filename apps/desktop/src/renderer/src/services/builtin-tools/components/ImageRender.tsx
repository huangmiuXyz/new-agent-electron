import { defineComponent, ref, onUnmounted, watch, PropType } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { useChatsStores } from '@renderer/stores/chats'
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

export const ImageRender = defineComponent({
  name: 'BuiltinImageRender',
  props: {
    args: { type: Object as PropType<Record<string, any>> },
    result: { type: Object as PropType<ToolOutput> },
    message: { type: Object as PropType<any>, required: true },
    tool_part: { type: Object as PropType<any>, required: true }
  },
  setup(props) {
    const localResult = ref<ToolOutput | null>(null)
    const isPolling = ref(false)
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

      const metadata = props.tool_part?.output?.image_metadata as ImageMetadata | undefined
      if (!metadata || !metadata.task_ids || metadata.task_ids.length === 0) return

      isPolling.value = true
      try {
        const providerInstance = getProviderInstance(metadata.providerId)
        if (!providerInstance.asyncResult) {
          throw new Error('提供商不支持异步任务查询')
        }

        const results = await Promise.all(
          metadata.task_ids.map((taskId) => providerInstance.asyncResult!({ task_id: taskId }))
        )

        const allImages = results.flatMap((result) =>
          (result.images || [])
            .map((img: any) => {
              if (typeof img === 'string') return img
              if (img.base64)
                return img.base64.startsWith('data:')
                  ? img.base64
                  : `data:image/png;base64,${img.base64}`
              return img.url || ''
            })
            .filter(Boolean) as string[]
        )

        updateMessageOutput({
          images: allImages,
          finished_task_ids: metadata.task_ids
        })
      } catch (error) {
        const e = error as Error
        console.error('Image polling error:', e)
        localResult.value = { ...localResult.value, error: e.message }
      } finally {
        isPolling.value = false
      }
    }

    const updateMessageOutput = (data: { images: string[]; finished_task_ids: string[] }) => {
      const cid = props.message?.metadata?.cid || props.tool_part?.output?.image_metadata?.chatId
      const mid = props.message?.id
      const toolCallId = props.tool_part?.toolCallId

      if (cid && mid && toolCallId) {
        const chat = chatsStore.getChatById(cid)
        const msg = chat?.messages.find((m: any) => m.id === mid)
        if (msg && msg.parts) {
          const partIndex = msg.parts.findIndex((p: any) => p.toolCallId === toolCallId)
          if (partIndex !== -1) {
            const newParts = [...msg.parts]
            const currentPart = newParts[partIndex] as any
            const currentOutput = (currentPart.output || {}) as ToolOutput
            const currentMetadata = currentOutput.image_metadata || {} as ImageMetadata

            newParts[partIndex] = {
              ...currentPart,
              output: {
                ...currentOutput,
                images: data.images,
                image_metadata: {
                  ...currentMetadata,
                  finished_task_ids: data.finished_task_ids
                }
              }
            }
            chatsStore.updateMessage(cid, mid, newParts)
          }
        }
      }

      localResult.value = { ...localResult.value, images: data.images }
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

    return () => {
      const images = props.result?.images || localResult.value?.images || []
      const error = props.result?.error || localResult.value?.error
      const prompt = props.args?.prompt

      return (
        <div
          class="builtin-image-render"
          style="display: flex; flex-direction: column; gap: 12px; padding: 8px;"
        >
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {prompt && (
              <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
                <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                  提示词:
                </span>
                {prompt}
              </div>
            )}
          </div>

          {error && (
            <div style="padding: 10px; color: var(--color-error); background: var(--bg-card-soft); border-left: 3px solid var(--color-error); border-radius: 4px; font-size: 12px;">
              <div style="font-weight: 600; margin-bottom: 2px;">生成失败</div>
              <div style="opacity: 0.9;">{error}</div>
            </div>
          )}

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
            {images.map((src: string, index: number) => (
              <div
                key={index}
                style="position: relative; border-radius: 8px; overflow: hidden; background: var(--bg-card-soft); aspect-ratio: 1/1;"
              >
                <img
                  src={src}
                  style="width: 100%; height: 100%; object-fit: cover;"
                  onClick={() => {
                    // TODO: Open preview
                  }}
                />
              </div>
            ))}
            {isPolling.value && (
              <div style="border-radius: 8px; overflow: hidden; background: var(--bg-card-soft); aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center;">
                <div class="loading-spinner">生成中...</div>
              </div>
            )}
          </div>
        </div>
      )
    }
  }
})

export default ImageRender
