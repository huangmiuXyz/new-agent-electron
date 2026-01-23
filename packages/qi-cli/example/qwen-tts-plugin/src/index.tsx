import { Plugin, PluginContext } from './types'
import { createQwen } from './qwen/qwen-provider'

const PLUGIN_NAME = 'qwen-tts-plugin'

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Qwen TTS 语音合成插件 (基于 ModelScope Gradio)',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    const PROVIDER_ID = 'qwen'
    const STORAGE_KEY = 'qwen-tts-config'

    const savedConfig = JSON.parse((await context.localforage.getItem(STORAGE_KEY)) || '{}')

    const [QwenForm] = context.useForm({
      fields: [
        {
          name: 'baseURL',
          type: 'input',
          label: '服务地址',
          placeholder: 'https://qwen-qwen3-tts.ms.show/',
          hint: 'Qwen TTS Gradio 服务的 URL'
        }
      ],
      initialData: {
        baseURL: savedConfig.baseURL || 'https://qwen-qwen3-tts.ms.show/'
      },
      onChange: (_field: string, _value: any, data: any) => {
        context.localforage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    })

    // 注册到 AI SDK 注册表
    context.registerRegistry(PROVIDER_ID, (options: any) => {
      return createQwen({
        ...options,
        baseURL: options.baseURL || savedConfig.baseURL
      })
    })

    // 注册到设置页面的提供商列表
    const provider = createQwen({ baseURL: savedConfig.baseURL })
    const models = await provider.listModels()

    context.registerProvider(PROVIDER_ID, {
      name: 'Qwen TTS',
      form: QwenForm,
      models: models
    })
  },

  uninstall: (context: PluginContext) => {
    context.unregisterProvider('qwen')
  }
}

export default plugin
