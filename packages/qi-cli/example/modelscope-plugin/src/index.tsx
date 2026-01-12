import { Plugin, PluginContext } from './types'
import { createModelScope } from './modelscope-provider'
import { z } from 'zod'
import { ModelScopeImageModel } from './modelscope-image-model'

/**
 * ModelScope AI Provider Plugin
 */
const plugin: Plugin = {
  name: 'modelscope-plugin',
  version: '1.0.0',
  description: 'ModelScope AIGC Image Generation Plugin',
  author: 'Zhuanz',

  install: async (context: PluginContext) => {
    const { defineComponent, watch, ref, onMounted, onUnmounted, markRaw } = context.vue
    const { Image, Loading, Input } = context.components
    const message = ref()

    const PROVIDER_ID = '魔搭'
    const STORAGE_KEY_MODEL_ID = 'modelscope_model_id'
    const DEFAULT_MODEL_ID = 'Tongyi-MAI/Z-Image-Turbo'

    const currentModelId = ref(DEFAULT_MODEL_ID)

    // 初始化加载配置
    const initConfig = async () => {
      const savedModelId = await context.localforage.getItem(STORAGE_KEY_MODEL_ID)
      if (savedModelId) {
        currentModelId.value = savedModelId
      }
      updateStatus()
    }

    // 状态图标组件 - 准备就绪
    const ReadyIcon = defineComponent({
      props: {
        modelId: { type: String, required: true }
      },
      setup(props: any) {
        const tempModelId = ref(props.modelId)
        const showTooltip = ref(false)

        const saveEdit = async () => {
          if (tempModelId.value && tempModelId.value !== props.modelId) {
            currentModelId.value = tempModelId.value
            await context.localforage.setItem(STORAGE_KEY_MODEL_ID, tempModelId.value)
            updateStatus()
          }
        }

        const toggleTooltip = (e: MouseEvent) => {
          e.stopPropagation()
          showTooltip.value = !showTooltip.value
        }

        const closeTooltip = () => {
          showTooltip.value = false
        }

        onMounted(() => {
          window.addEventListener('click', closeTooltip)
        })

        onUnmounted(() => {
          window.removeEventListener('click', closeTooltip)
        })

        return () => (
          <div class="plugin-icon-container" onClick={toggleTooltip}>
            <style>{`
              .plugin-icon-container { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; cursor: pointer; }
              .plugin-tooltip {
                position: absolute;
                bottom: 100%;
                left: 0;
                margin-bottom: 10px;
                visibility: hidden;
                opacity: 0;
                transition: opacity 0.15s ease, visibility 0.15s;
                z-index: 10000;
              }
              .plugin-tooltip.is-show {
                visibility: visible;
                opacity: 1;
              }
              .plugin-tooltip-content {
                background: #ffffff; color: #333333; padding: 12px 16px; border-radius: 8px;
                font-size: 13px; white-space: nowrap;
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                border: 1px solid #e0e0e0;
                min-width: 320px;
              }
              html.dark-mode .plugin-tooltip-content { background: #2d2d2d; color: #ffffff; border-color: #444444; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }

              .plugin-tooltip-content :deep(.input-wrapper) {
                margin-left: 12px;
                flex: 1;
              }

              /* 确保使用组件原生样式，不强制重写高度和字体 */
              .plugin-tooltip-content :deep(.form-input) {
                width: 100%;
              }
            `}</style>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M21 16.5C21 16.88 20.79 17.21 20.47 17.38L12.57 21.82C12.41 21.94 12.21 22 12 22C11.79 22 11.59 21.94 11.43 21.82L3.53 17.38C3.21 17.21 3 16.88 3 16.5V7.5C3 7.12 3.21 6.79 3.53 6.62L11.43 2.18C11.59 2.06 11.79 2 12 2C12.21 2 12.41 2.06 12.57 2.18L20.47 6.62C20.79 6.79 21 7.12 21 7.5V16.5Z" />
            </svg>

            <div
              class={['plugin-tooltip', showTooltip.value && 'is-show']}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <div class="plugin-tooltip-content">
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>ModelScope 绘图</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>当前模型:</span>
                  <Input
                    v-model={tempModelId.value}
                    onBlur={saveEdit}
                    onKeydown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') saveEdit()
                      if (e.key === 'Escape') {
                        tempModelId.value = props.modelId
                        const target = e.target as HTMLInputElement
                        target.blur()
                      }
                    }}
                    placeholder="输入模型 ID..."
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      }
    })

    // 状态图标组件 - 加载中
    const LoadingIcon = defineComponent({
      setup() {
        return () => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <style>{`
              @keyframes plugin-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            <svg
              style={{ animation: 'plugin-spin 1s linear infinite' }}
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
          </div>
        )
      }
    })

    const updateStatus = async (isLoading = false) => {
      const modelId = currentModelId.value

      if (isLoading) {
        context.notification.status('modelscope-status', '', {
          render: markRaw(LoadingIcon),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 正在生成图片...`
        })
      } else {
        context.notification.status('modelscope-status', '', {
          render: markRaw(() => <ReadyIcon modelId={modelId} />),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 已就绪 (模型: ${modelId})`
        })
      }
    }

    const getModelConfig = async () => {
      const settingsStore = await context.getStore('settings')
      const provider = settingsStore.providers?.find((p: any) => p.id === PROVIDER_ID)
      return {
        modelId: currentModelId.value,
        apiKey: provider?.apiKey || '',
        baseURL: provider?.baseUrl || 'https://api-inference.modelscope.cn/'
      }
    }

    // 初始化
    initConfig()

    // 注册内置工具
    context.registerBuiltinTool('modelscope_image_generator', {
      description:
        '使用 ModelScope AIGC 模型生成图片。支持多种模型，可以指定提示词、图片尺寸等参数。',
      inputSchema: z.object({
        prompt: z.string().describe('生成图片的正向提示词，建议使用英文描述以获得更好效果。'),
        negative_prompt: z.string().optional().describe('负向提示词，用于排除不需要的元素。'),
        size: z
          .string()
          .optional()
          .default('1024x1024')
          .describe('生成图片的尺寸，如 1024x1024, 720x1280 等。'),
        seed: z.number().optional().describe('随机种子，用于复现生成的图片。')
      }),
      title: 'ModelScope 绘图',
      render: defineComponent({
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
            const taskId = props.message?.metadata?.task_id
            if (!taskId || props.result || localResult.value || isPolling.value) return

            isPolling.value = true
            try {
              const config = await getModelConfig()
              const modelId = props.args?.model || config.modelId

              // 显示正在恢复的状态
              await updateStatus(true)

              const model = new ModelScopeImageModel(modelId, {
                apiKey: config.apiKey,
                baseURL: config.baseURL
              })

              const result = await model.waitForTask(taskId, abortController.signal)
              if (result && result.images) {
                await updateStatus(false)
                localResult.value = { images: result.images }
                const chatsStore = await context.getStore('chats')
                const cid = props.message?.metadata?.cid
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
              await updateStatus(false)
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
            watch(
              () => props.message,
              () => {
                message.value = props.message
              },
              { immediate: true }
            )
            if (error) {
              return (
                <div style="padding: 12px; color: var(--color-error); background: var(--bg-card); border: 1px solid var(--color-error); border-radius: 8px; font-size: 13px;">
                  <div style="font-weight: 600; margin-bottom: 4px;">Generation Failed</div>
                  {error}
                </div>
              )
            }

            return (
              <div style="display: flex; flex-direction: column; gap: 12px; padding: 8px;">
                {prompt && (
                  <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
                    <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">
                      提示词:
                    </span>
                    {prompt}
                  </div>
                )}
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
      }),
      execute: async (args: any) => {
        const { prompt, negative_prompt, model: modelId, size, seed } = args

        try {
          const config = await getModelConfig()

          // 创建模型实例
          const targetModelId = modelId || config.modelId
          const model = new ModelScopeImageModel(targetModelId, {
            apiKey: config.apiKey,
            baseURL: config.baseURL
          })

          // 显示生成状态
          await updateStatus(true)

          // 执行生成
          const result = await model.doGenerate({
            prompt,
            files: [],
            mask: undefined,
            n: 1,
            size,
            seed,
            aspectRatio: undefined,
            providerOptions: {
              modelscope: {
                negative_prompt,
                onStart: async (task_id: string) => {
                  const chatsStore = await context.getStore('chats')
                  if (message.value?.metadata?.cid) {
                    const metadata = { ...message.value.metadata, task_id }
                    chatsStore.updateMessageMetadata(
                      message.value.metadata.cid,
                      message.value.id,
                      metadata
                    )
                  }
                }
              } as any
            }
          })

          await updateStatus(false)

          // 返回结果
          const images = result.images
          if (images && images.length > 0) {
            const report = images
              .map((base64, index) => {
                return `![Generated Image ${index + 1}](data:image/png;base64,${base64})`
              })
              .join('\n\n')

            return {
              images,
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: `<|stop|>图片生成成功！\n\n${report}`
                  }
                ]
              }
            }
          } else {
            throw new Error('模型未返回任何图片数据')
          }
        } catch (error: any) {
          await updateStatus(false)
          context.notification.error(`图片生成失败: ${error.message}`)
          return {
            error: error.message,
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `<|stop|>图片生成失败: ${error.message}`
                }
              ]
            }
          }
        }
      }
    })

    // 注册到全局模型注册表
    context.registerRegistry('modelscope', (options: any) => {
      return createModelScope(options)
    })
  },

  uninstall: (context: PluginContext) => {
    // 卸载逻辑
  }
}

export default plugin
