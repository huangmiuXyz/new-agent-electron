import { Plugin, PluginContext } from './types'
import { createQwen } from './qwen/qwen-provider'

const PLUGIN_NAME = 'qwen-tts-plugin'
const STORAGE_KEY = 'qwen-tts-config'
const PROVIDER_ID = 'qwen-tts'

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Qwen TTS 语音合成插件 (基于 ModelScope Gradio)',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    const { localforage, useForm, registerRegistry, registerProvider } = context

    // 加载保存的配置
    const savedConfig: any = (await localforage.getItem(STORAGE_KEY)) || {}

    const [ConfigForm] = useForm({
      fields: [
        {
          name: 'baseURL',
          label: 'Base URL',
          type: 'text',
          placeholder: '输入 Qwen TTS 服务地址...',
          hint: 'Qwen TTS 服务的 Gradio 地址，例如: https://qwen-qwen3-tts.ms.show/'
        },
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'password',
          placeholder: '输入 ModelScope Studio Token...',
          hint: '在 ModelScope 设置中获取 Studio Token。'
        }
      ],
      initialData: {
        baseURL: savedConfig.baseURL || 'https://qwen-qwen3-tts.ms.show/',
        apiKey: savedConfig.apiKey || ''
      },
      onChange: async (_field: string, _value: any, data: any) => {
        await localforage.setItem(STORAGE_KEY, JSON.parse(JSON.stringify(data)))
      }
    })

    const qwen = createQwen({
      baseURL: savedConfig.baseURL,
      apiKey: savedConfig.apiKey
    })
    // 初始化注册
    registerRegistry(PROVIDER_ID, () => {
      return qwen
    })
    registerProvider(PROVIDER_ID, {
      name: 'Qwen TTS',
      providerType: PROVIDER_ID,
      form: ConfigForm,
      models: await qwen.listModels()
    })
  },

  uninstall: (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID)
  }
}

export default plugin
