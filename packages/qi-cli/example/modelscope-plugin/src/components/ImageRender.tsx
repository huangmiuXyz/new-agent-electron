import { PluginContext } from '../types'
import { ModelScopeImageModel } from '../modelscope/modelscope-image-model'
import { createModelScope } from '../modelscope/modelscope-provider'
import { PLUGIN_NAME } from '../constants'

export function createImageRender(context: PluginContext, getModelConfig: () => Promise<any>) {
  const { defineComponent, ref, onUnmounted, watch } = context.vue
  const { Image, Button } = context.components

  return defineComponent({
    name: 'ModelScopeImageRender',
    props: {
      args: { type: Object },
      result: { type: Object },
      message: { type: Object },
      tool_part: { type: Object }
    },
    setup(props: { args?: any; result?: any; message: any; tool_part: any }) {
      const localResult = ref(null) as any
      const isPolling = ref(false)
      const isRegenerating = ref(false)
      const abortController = new AbortController()

      const pollStatus = async () => {
        if (isPolling.value) return

        isPolling.value = true
        try {
          const config = await getModelConfig()
          const modelScope = createModelScope({
            apiKey: config.apiKey,
            baseURL: config.baseURL
          })
          const model = modelScope.image(config.model) as ModelScopeImageModel

          // 使用 while 循环，以便在轮询期间动态发现新添加的任务
          let finishedCount = 0
          const chatsStore = await context.getStore('chats')
          const cid = props.message?.metadata?.cid || props.tool_part?.output?.modelscope_metadata?.chatId
          const mid = props.message?.id

          while (true) {
            const chat = chatsStore.getChatById(cid)
            const msg = chat?.messages.find((m: any) => m.id === mid)
            const toolCallId = props.tool_part?.toolCallId

            let modelscopeMetadata: any = null
            if (msg) {
              const part = msg.parts?.find((p: any) => p.toolCallId === toolCallId)
              modelscopeMetadata = part?.output?.modelscope_metadata
            }

            if (!modelscopeMetadata) {
              // 回退到 props
              modelscopeMetadata = props.tool_part?.output?.modelscope_metadata
            }

            const taskIds = modelscopeMetadata?.task_ids || []
            const finishedTaskIds = modelscopeMetadata?.finished_task_ids || []

            // 确定下一个要处理的任务索引
            // 优先使用 finished_task_ids 的长度作为起点
            const nextIndex = Math.max(finishedCount, finishedTaskIds.length)

            if (nextIndex >= taskIds.length) {
              break // 所有任务已处理
            }

            const taskId = taskIds[nextIndex]
            let success = false
            let resultImages: any[] = []

            try {
              const result = await model.waitForTask(taskId, abortController.signal)
              if (result && result.images) {
                success = true
                resultImages = result.images
              }
            } catch (pollError: any) {
              console.error(`Task ${taskId} failed:`, pollError)
              localResult.value = { ...localResult.value, error: pollError.message }
            }

            if (cid && mid) {
              const chat = chatsStore.getChatById(cid)
              const msg = chat?.messages.find((m: any) => m.id === mid)
              if (msg && msg.parts) {
                const partIndex = msg.parts.findIndex(
                  (p: any) => p.toolCallId === props.tool_part?.toolCallId
                )
                if (partIndex !== -1) {
                  const latestOutput = msg.parts[partIndex].output || {}
                  const latestMetadata = latestOutput.modelscope_metadata || modelscopeMetadata
                  const latestImages = latestOutput.images || []

                  const updatedImages = success ? [...latestImages, ...resultImages] : latestImages
                  const updatedFinishedTaskIds = [
                    ...(latestMetadata.finished_task_ids || []),
                    taskId
                  ]

                  const updatedMetadata = {
                    ...latestMetadata,
                    finished_task_ids: updatedFinishedTaskIds
                  }

                  const newParts = [...msg.parts]
                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    output: {
                      ...newParts[partIndex].output,
                      images: updatedImages,
                      modelscope_metadata: updatedMetadata,
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
          }
        } catch (error: any) {
          console.error('ModelScope polling flow error:', error)
          localResult.value = { ...localResult.value, error: error.message }
        } finally {
          isPolling.value = false
        }
      }

      const handleRegenerate = async () => {
        if (isRegenerating.value) return

        const toolCallId = props.tool_part?.toolCallId
        const modelscopeMetadata = props.tool_part?.output?.modelscope_metadata

        if (!modelscopeMetadata || !modelscopeMetadata.config) return

        isRegenerating.value = true
        try {
          const config = await getModelConfig()
          const modelScope = createModelScope({
            apiKey: config.apiKey,
            baseURL: config.baseURL
          })
          const model = modelScope.image(config.model) as ModelScopeImageModel
          await model.doGenerate(
            {
              prompt: props.args?.prompt || '',
              n: 1,
              size: modelscopeMetadata.config.size,
              seed: modelscopeMetadata.config.seed,
              aspectRatio: undefined,
              files: [],
              mask: undefined,
              providerOptions: {
                modelscope: modelscopeMetadata.config
              }
            },
            {
              onStart: async (taskId: string) => {
                const chatsStore = await context.getStore('chats')
                const cid = modelscopeMetadata.chatId
                const mid = props.message.id
                if (cid && mid) {
                  const chat = chatsStore.getChatById(cid)
                  const msg = chat?.messages.find((m: any) => m.id === mid)

                  if (msg && msg.parts) {
                    const partIndex = msg.parts.findIndex(
                      (p: any) => p.toolCallId === props.tool_part?.toolCallId
                    )

                    if (partIndex !== -1) {
                      const currentOutput = msg.parts[partIndex].output || {}
                      const currentMetadata =
                        currentOutput.modelscope_metadata ||
                        msg.metadata?.[PLUGIN_NAME]?.[toolCallId] ||
                        {}
                      const currentTaskIds = currentMetadata.task_ids || []
                      const updatedTaskIds = [...currentTaskIds, taskId]

                      const updatedMetadata = {
                        ...currentMetadata,
                        task_ids: updatedTaskIds
                      }
                      if (msg.metadata?.[PLUGIN_NAME]?.[toolCallId]) {
                        msg.metadata[PLUGIN_NAME][toolCallId].task_ids = updatedTaskIds
                      }

                      msg.parts[partIndex].output = {
                        ...currentOutput,
                        modelscope_metadata: updatedMetadata
                      }
                      chatsStore.updateMessage(cid, mid, [...msg.parts])
                    }
                  }
                }
              }
            }
          )
        } catch (error: any) {
          console.error('Regeneration failed:', error)
          localResult.value = { ...localResult.value, error: error.message }
        } finally {
          isRegenerating.value = false
        }
      }

      watch(
        () => {
          const modelscopeMetadata = props.tool_part?.output?.modelscope_metadata
          return modelscopeMetadata?.task_ids?.length || 0
        },
        (newLen: number, oldLen: number) => {
          if (newLen > (oldLen || 0)) {
            pollStatus()
          }
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
        const modelscopeMetadata = props.tool_part?.output?.modelscope_metadata
        const config = modelscopeMetadata?.config

        const renderLoras = (loras: any) => {
          if (!loras) return null
          if (typeof loras === 'string') return loras
          const entries = Object.entries(loras)
          if (entries.length === 0) return null
          return entries.map(([name, weight]) => `${name}: ${weight}`).join(', ')
        }

        const hasLoras =
          config?.loras &&
          (typeof config.loras === 'string' || Object.keys(config.loras).length > 0)

        return (
          <div style="display: flex; flex-direction: column; gap: 12px; padding: 8px;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              {prompt && (
                <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
                  <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                    提示词:
                  </span>
                  {prompt}
                </div>
              )}
              {config?.negative_prompt && (
                <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; opacity: 0.8;">
                  <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                    负面提示词:
                  </span>
                  {config.negative_prompt}
                </div>
              )}
              <div style="display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 11px; color: var(--text-secondary); opacity: 0.7;">
                {config?.model && (
                  <div>
                    <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                      模型:
                    </span>
                    {config.model}
                  </div>
                )}
                {config?.size && (
                  <div>
                    <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                      尺寸:
                    </span>
                    {config.size}
                  </div>
                )}
                {config?.seed !== undefined && (
                  <div>
                    <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                      种子:
                    </span>
                    {config.seed}
                  </div>
                )}
                {hasLoras && (
                  <div>
                    <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                      LoRAs:
                    </span>
                    {renderLoras(config.loras)}
                  </div>
                )}
              </div>
            </div>
            {error && (
              <div style="padding: 10px; color: var(--color-error); background: var(--bg-card-soft); border-left: 3px solid var(--color-error); border-radius: 4px; font-size: 12px; margin-bottom: 4px;">
                <div style="font-weight: 600; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 14px;">⚠️</span> Generation Failed
                </div>
                <div style="opacity: 0.9; line-height: 1.4;">{error}</div>
              </div>
            )}
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
              {images.map((base64: string, index: number) => (
                <div
                  key={index}
                  style="position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-card);"
                >
                  <Image
                    src={`data:image/png;base64,${base64}`}
                    style="width: 100%; height: auto; display: block;"
                    alt={`Generated image ${index + 1}`}
                    preview={true}
                  />
                </div>
              ))}
              {(isPolling.value || isRegenerating.value) && (
                <div style="position: relative; border-radius: 8px; overflow: hidden; border: 1px dashed var(--border-color); background: var(--bg-card);">
                  <Image style="width: 100%; height: 200px; display: block;" loading={true} />
                </div>
              )}
            </div>
            <div style="margin-top: 4px; display: flex;">
              <Button
                type="primary"
                size="sm"
                onClick={handleRegenerate}
                loading={isRegenerating.value}
                disabled={isRegenerating.value}
              >
                重新生成
              </Button>
            </div>
          </div>
        )
      }
    }
  })
}
