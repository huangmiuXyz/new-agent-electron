import { Plugin, PluginContext } from './types'
import { createModelScope } from './modelscope/modelscope-provider'
import { z } from 'zod/v4'
import { ModelScopeImageModel } from './modelscope/modelscope-image-model'
import { usePluginConfig } from './hooks/use-plugin-config'
import { createConfigIcon } from './components/ConfigIcon'
import { createLoadingIcon } from './components/LoadingIcon'
import { createImageRender } from './components/ImageRender'
import { PROVIDER_ID, DEFAULT_BASE_URL } from './constants'
/**
 * ModelScope AI Provider Plugin
 */
const plugin: Plugin = {
  name: 'modelscope-plugin',
  version: '1.0.0',
  description: 'ModelScope AIGC Image Generation Plugin',
  author: 'Zhuanz',

  install: async (context: PluginContext) => {
    const { markRaw, ref } = context.vue
    const message = ref()

    const updateStatus = async (isLoading = false) => {
      const modelId = config.currentModelId.value

      if (isLoading) {
        context.notification.status('modelscope-status', '', {
          render: markRaw(LoadingIcon),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 正在生成图片...`
        })
      } else {
        context.notification.status('modelscope-status', '', {
          render: markRaw(() => <ConfigIcon />),
          color: 'var(--color-primary)',
          tooltip: `ModelScope 已就绪 (模型: ${modelId})`
        })
      }
    }

    const config = usePluginConfig(context, () => updateStatus())
    const ConfigIcon = createConfigIcon(context, config.ConfigForm)
    const LoadingIcon = createLoadingIcon(context)

    const getModelConfig = async () => {
      const settingsStore = await context.getStore('settings')
      console.log(config)
      const provider = settingsStore.providers?.find((p: any) => p.id === PROVIDER_ID)
      return {
        modelId: config.currentModelId.value,
        negativePrompt: config.currentNegativePrompt.value,
        size: config.currentSize.value,
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
        prompt: z.string().describe('生成图片的正向提示词，建议使用英文描述以获得更好效果。'),
        seed: z.number().optional().describe('随机种子，用于复现生成的图片。')
      }),
      title: 'ModelScope 绘图',
      render: ImageRender,
      execute: async (args: any) => {
        const { prompt, seed } = args

        try {
          const modelConfig = await getModelConfig()

          // 创建模型实例
          const targetModelId = modelConfig.modelId
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
              size: modelConfig.size,
              seed,
              aspectRatio: undefined,
              providerOptions: {
                modelscope: {
                  negative_prompt: modelConfig.negativePrompt
                }
              }
            },
            {
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
          await updateStatus(false)
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
