import { Plugin, PluginContext } from './types'
import { createModelScope } from './modelscope/modelscope-provider'
import { z } from 'zod/v4'
import { ModelScopeImageModel } from './modelscope/modelscope-image-model'
import { usePluginConfig } from './hooks/use-plugin-config'
import { createLoadingIcon } from './components/LoadingIcon'
import { createImageRender } from './components/ImageRender'
import { PROVIDER_ID, DEFAULT_BASE_URL } from './constants'
import { ModelScopeErrorData } from './modelscope/modelscope-error'
import { APICallError } from '@ai-sdk/provider'
/**
 * ModelScope AI Provider Plugin
 */

const TOOLNAME = 'tool-modelscope_image_generator'
const plugin: Plugin = {
  name: 'modelscope-plugin',
  version: '1.0.0',
  description: 'ModelScope AIGC Image Generation Plugin',
  author: 'Zhuanz',

  install: async (context: PluginContext) => {
    const { markRaw, ref } = context.vue
    const { SelectorPopover } = context.components

    const updateStatus = async (isLoading = false) => {
      const modelId = config.config.value.model

      if (isLoading) {
        context.notification.status('modelscope-status', '', {
          render: markRaw(() => <LoadingIcon />),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 正在生成图片...`
        })
      } else {
        context.notification.status('modelscope-status', '', {
          render: markRaw(() => (
            <div
              style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <SelectorPopover width="400px">
                {{
                  trigger: () => (
                    <div style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; cursor: pointer;">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M21 16.5C21 16.88 20.79 17.21 20.47 17.38L12.57 21.82C12.41 21.94 12.21 22 12 22C11.79 22 11.59 21.94 11.43 21.82L3.53 17.38C3.21 17.21 3 16.88 3 16.5V7.5C3 7.12 3.21 6.79 3.53 6.62L11.43 2.18C11.59 2.06 11.79 2 12 2C12.21 2 12.41 2.06 12.57 2.18L20.47 6.62C20.79 6.79 21 7.12 21 7.5V16.5Z" />
                      </svg>
                    </div>
                  ),
                  content: () => (
                    <div
                      style={{
                        maxHeight: '450px',
                        overflowY: 'auto'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>
                        ModelScope 绘图配置
                      </div>
                      <config.ConfigForm />
                    </div>
                  )
                }}
              </SelectorPopover>
            </div>
          )),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 已就绪 (模型: ${modelId})`
        })
      }
    }

    const config = usePluginConfig(context, () => updateStatus())
    const LoadingIcon = createLoadingIcon(context)

    const getModelConfig = async () => {
      const settingsStore = await context.getStore('settings')
      const provider = settingsStore.providers?.find((p: any) => p.id === PROVIDER_ID)
      return {
        ...config.config.value,
        apiKey: provider?.apiKey || '',
        baseURL: provider?.baseUrl || DEFAULT_BASE_URL
      }
    }

    const ImageRender = createImageRender(context, getModelConfig)

    // 初始化
    config.initConfig()

    // 注册内置工具
    context.registerBuiltinTool('modelscope_image_generator', {
      description:
        '使用 ModelScope AIGC 模型生成图片。支持多种模型，可以指定提示词、图片尺寸等参数。',
      inputSchema: z.object({
        prompt: z.string().describe('生成图片的正向提示词，建议使用英文描述以获得更好效果。')
      }),
      title: 'ModelScope 绘图',
      render: ImageRender,
      execute: async (args: any, options: any) => {
        const { prompt, seed } = args
        const { toolCallId, chatId } = options

        try {
          const modelConfig = await getModelConfig()

          // 创建模型实例
          const targetModelId = modelConfig.model as string
          const model = new ModelScopeImageModel(targetModelId, {
            provider: 'modelscope.image',
            url: ({ path }) => `${modelConfig.baseURL}${path}`,
            headers: () => ({
              Authorization: `Bearer ${modelConfig.apiKey}`
            })
          })

          // 显示生成状态
          await updateStatus(true)

          // 执行生成
          const result = await model.doGenerate(
            {
              prompt,
              files: [],
              mask: undefined,
              n: 1,
              size: modelConfig.size as `${number}x${number}`,
              seed: seed ?? (modelConfig.seed as number),
              aspectRatio: undefined,
              providerOptions: {
                modelscope: {
                  ...modelConfig
                }
              }
            },
            {
              onStart: async (task_id: string) => {
                const chatsStore = await context.getStore('chats')
                if (chatId) {
                  const chat = chatsStore.getChatById(chatId)
                  const msg = chat?.messages.find((m: any) =>
                    m.parts?.some((p: any) => p?.toolCallId === toolCallId)
                  )
                  if (msg) {
                    const metadata = { ...msg.metadata, task_id, chatId }
                    chatsStore.updateMessageMetadata(chatId, msg.id, metadata)
                  }
                }
              }
            }
          )

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
          const body = JSON.parse(error.responseBody) as ModelScopeErrorData
          await updateStatus(false)
          return {
            error: body?.errors?.message || error.message,
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `<|stop|>图片生成失败: ${body?.errors?.message || error.message}`
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

    // 注册提供商信息和模型列表
    const modelscope = createModelScope()
    const models = await modelscope.listModels()
    context.registerProvider('modelscope', {
      name: 'ModelScope',
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category
      }))
    })
  },

  uninstall: () => {
    // 卸载逻辑
  }
}

export default plugin
