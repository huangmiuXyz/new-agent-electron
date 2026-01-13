import { PluginContext } from '../types'
import { ModelScopeImageModel } from  '../modelscope/modelscope-image-model'
import { PLUGIN_NAME } from '../constants'

export function createImageRender(context: PluginContext, getModelConfig: () => Promise<any>) {
  const { defineComponent, ref, onMounted, onUnmounted } = context.vue
  const { Image, Loading } = context.components

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
      const abortController = new AbortController()

      const pollStatus = async () => {
        const modelscopeMetadata = props.message?.metadata?.[PLUGIN_NAME]
        const taskId = modelscopeMetadata?.task_id
        if (!taskId || props.result || localResult.value || isPolling.value) return

        isPolling.value = true
        try {
          const config = await getModelConfig()
          const modelId = config.model

          const model = new ModelScopeImageModel(modelId, {
            provider: 'modelscope.image',
            url: ({ path }) => `${config.baseURL}${path}`,
            headers: () => ({
              Authorization: `Bearer ${config.apiKey}`
            })
          })

          const result = await model.waitForTask(taskId, abortController.signal)
          if (result && result.images) {
            localResult.value = { images: result.images }
            const chatsStore = await context.getStore('chats')
            const cid = modelscopeMetadata?.chatId || props.message?.metadata?.cid
            const mid = props.message?.id
            if (cid && mid) {
              const chat = chatsStore.getChatById(cid)
              const msg = chat?.messages.find((m: any) => m.id === mid)
              if (msg && msg.parts) {
                const partIndex = msg.parts.findIndex(
                  (p: any) => p.toolCallId === props.tool_part?.toolCallId
                )
                if (partIndex !== -1) {
                  const newParts = [...msg.parts]
                  const report = (result.images as any[])
                    .map((base64: string, index: number) => {
                      return `![Generated Image ${index + 1}](data:image/png;base64,${base64})`
                    })
                    .join('\n\n')

                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    output: {
                      images: result.images,
                      toolResult: {
                        content: [
                          {
                            type: 'text',
                            text: `<|stop|>图片生成成功！\n\n${report}`
                          }
                        ]
                      }
                    }
                  }
                  chatsStore.updateMessage(cid, mid, newParts)
                }
              }
            }
          }
        } catch (error: any) {
          console.error('ModelScope polling failed:', error)
          localResult.value = { error: error.message }
        } finally {
          isPolling.value = false
        }
      }

      onMounted(() => {
        pollStatus()
      })

      onUnmounted(() => {
        abortController.abort()
      })

      return () => {
        const images = props.result?.images || localResult.value?.images || []
        const error = props.result?.error || localResult.value?.error
        const prompt = props.args?.prompt
        const modelscopeMetadata = props.message?.metadata?.[PLUGIN_NAME]
        const config = modelscopeMetadata?.config

        if (error) {
          return (
            <div style="padding: 12px; color: var(--color-error); background: var(--bg-card); border: 1px solid var(--color-error); border-radius: 8px; font-size: 13px;">
              <div style="font-weight: 600; margin-bottom: 4px;">Generation Failed</div>
              {error}
            </div>
          )
        }

        const renderLoras = (loras: any) => {
          if (!loras) return null
          if (typeof loras === 'string') return loras
          const entries = Object.entries(loras)
          if (entries.length === 0) return null
          return entries
            .map(([name, weight]) => `${name}: ${weight}`)
            .join(', ')
        }

        const hasLoras = config?.loras && (typeof config.loras === 'string' || Object.keys(config.loras).length > 0)

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
            {!props.result && !localResult.value && !error ? (
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; gap: 12px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color);">
                <Loading size="large" />
                <div style="font-size: 13px; color: var(--text-secondary);">
                  正在{isPolling.value ? '恢复生成状态' : '生成图片'}，请稍候...
                </div>
              </div>
            ) : (
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
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    }
  })
}
