import { Plugin } from './types'
import * as Vosk from 'vosk-browser'
import { defineComponent, h, onMounted, onUnmounted, ref, markRaw } from 'vue'

// 定义 Vue 组件
const LoadingIcon = defineComponent({
  setup() {
    const dots = ref('.')
    let timer: any

    onMounted(() => {
      timer = setInterval(() => {
        dots.value = dots.value.length >= 3 ? '.' : dots.value + '.'
      }, 500)
    })

    onUnmounted(() => {
      clearInterval(timer)
    })

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
        <span style={{ fontSize: '12px', minWidth: '20px' }}>{dots.value}</span>
      </div>
    )
  }
})

const ReadyIcon = defineComponent({
  props: {
    modelName: {
      type: String,
      required: true
    }
  },
  setup(props) {
    return () => (
      <div className="plugin-icon-container">
        <style>{`
          .plugin-icon-container {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%
          }
          .plugin-tooltip {
              position: absolute;
              bottom: 100%;
              left: 0;
              transform: translateY(-8px);
              background: #ffffff;
              color: #333333;
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 12px;
              white-space: nowrap;
              visibility: hidden;
              opacity: 0;
              transition: all 0.2s ease;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 10000;
              border: 1px solid #e0e0e0;
            }
            /* 黑暗模式适配 */
            html.dark-mode .plugin-tooltip {
              background: #2d2d2d;
              color: #ffffff;
              border-color: #444444;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            }
            .plugin-icon-container:hover .plugin-tooltip {
              visibility: visible;
              opacity: 1;
              transform: translateY(-12px);
            }
            .plugin-tooltip::after {
              content: "";
              position: absolute;
              top: 100%;
              left: 10px;
              border: 6px solid transparent;
              border-top-color: #ffffff;
            }
            html.dark-mode .plugin-tooltip::after {
              border-top-color: #2d2d2d;
            }
            .model-tag {
              background: #f0f0f0;
              padding: 2px 6px;
              border-radius: 4px;
              margin-left: 8px;
              font-family: monospace;
              color: #007acc;
            }
            html.dark-mode .model-tag {
              background: #444444;
              color: #61dafb;
            }
        `}</style>

        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>

        <div className="plugin-tooltip">
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Vosk 语音识别</div>
          <div style={{ color: '#aaa' }}>
            当前模型: <span className="model-tag">{props.modelName}</span>
          </div>
        </div>
      </div>
    )
  }
})

let model: Vosk.Model | null = null
let recognizer: Vosk.KaldiRecognizer | null = null
let modelLoadingPromise: Promise<Vosk.Model> | null = null
const MODEL_NAME = 'vosk-model-small-cn-0.22.zip'

const plugin: Plugin = {
  name: 'vosk-speech-recognition',
  version: '1.0.0',
  description: 'Vosk 实时语音识别插件',

  async install(context) {
    console.log('Vosk Speech Recognition 插件正在执行 install...')
    // 获取 settingsStore
    const settingsStore = await context.getStore('settings')
    // 注册 Vosk 提供商
    const STORAGE_KEY = 'vosk-config'
    const savedConfig = JSON.parse((await context.localforage.getItem(STORAGE_KEY)) || '{}')
    const [TableComponent, { setData, getData }] = context.useTable({
      data: [],
      columns: () => [
        { key: 'name', label: '模型名称', width: '2fr' },
        { key: 'id', label: '模型ID', width: '2fr' },
        {
          key: 'active',
          label: '启用',
          width: '1fr',
          render: (row: any) =>
            context.components.Switch({
              modelValue: row.active,
              'onUpdate:modelValue': (val: boolean) => {
                const currentData = getData()
                const newData = currentData.map((item: any) => {
                  if (item.id === row.id) {
                    return { ...item, active: val }
                  }
                  return item
                })
                setData(newData)
                setFieldValue('models', newData)

                // 同步到 settingsStore
                const index = settingsStore.registeredProviders.findIndex(
                  (p: any) => p.id === 'vosk-local'
                )
                if (index !== -1) {
                  const provider = settingsStore.registeredProviders[index]
                  const updatedProviders = [...settingsStore.registeredProviders]
                  updatedProviders[index] = { ...provider, models: newData }
                  settingsStore.registeredProviders = updatedProviders
                }
              }
            })
        },
        {
          key: 'action',
          label: '操作',
          width: '2fr',
          render: (row: any) =>
            context.components.Button(
              {
                danger: true,
                size: 'sm',
                onClick: () => {
                  const currentData = getData()
                  const newData = currentData.filter((item: any) => item.id !== row.id)
                  setData(newData)
                  setFieldValue('models', newData)

                  // 同步到 settingsStore
                  const index = settingsStore.registeredProviders.findIndex(
                    (p: any) => p.id === 'vosk-local'
                  )
                  if (index !== -1) {
                    const provider = settingsStore.registeredProviders[index]
                    const updatedProviders = [...settingsStore.registeredProviders]
                    updatedProviders[index] = { ...provider, models: newData }
                    settingsStore.registeredProviders = updatedProviders
                  }
                }
              },
              '删除'
            )
        }
      ]
    })
    const [VoskForm, { getFieldValue, setFieldValue, getData: getFormData }] = context.useForm({
      fields: [
        {
          name: 'modelPath',
          type: 'path',
          label: '模型路径',
          placeholder: '留空使用默认内置模型',
          hint: '自定义 Vosk 模型目录的绝对路径',
          dialogOptions: {
            properties: ['openFile'],
            title: '选择 Vosk 模型'
          }
        },
        {
          name: 'models',
          type: 'custom',
          render: (row: any) => {
            setData(row.models)
            return TableComponent
          }
        }
      ],
      initialData: {
        modelPath: savedConfig.modelPath || '',
        models: [
          {
            id: 'vosk-cn',
            name: 'Vosk 中文模型',
            active: true,
            category: 'speech',
            created: Date.now(),
            object: 'model',
            owned_by: 'vosk-speech-recognition'
          }
        ]
      },
      onChange: (_field: string, _value: any, data: any) => {
        console.log('Vosk 配置更新:', data)
        context.localforage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    })

    context.registerProvider('vosk-local', {
      name: 'Vosk',
      form: VoskForm,
      ...getFormData()
    })

    const initModel = async (silent = false) => {
      if (model) return model
      if (modelLoadingPromise) return modelLoadingPromise

      modelLoadingPromise = (async () => {
        let closeLoading: (() => void) | null = null
        try {
          if (!context.api) {
            throw new Error('应用 API 未就绪')
          }

          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(LoadingIcon),
              color: '#fff',
              tooltip: '正在加载 Vosk 模型...'
            })
            closeLoading = context.notification.loading(
              `正在初始化语音识别引擎并加载 Vosk 模型 (${MODEL_NAME})...`,
              '语音识别'
            )
          }
          const modelPath = getFieldValue('modelPath')
          const fullPath = context.api.path.join(context.basePath || '', MODEL_NAME)
          console.log('Vosk fullPath:', fullPath || modelPath)

          const normalizedPath = (modelPath || fullPath).replace(/\\/g, '/')
          const modelUrl = `plugin-resource://${normalizedPath}`

          console.log('正在加载 Vosk 模型 (固定地址):', modelUrl)

          model = await Vosk.createModel(modelUrl)
          console.log('Vosk 模型加载成功 (通过自定义协议)')

          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(() => h(ReadyIcon, { modelName: MODEL_NAME })),
              color: '#fff',
              tooltip: `Vosk 语音识别已就绪 (模型: ${MODEL_NAME})`
            })
          }

          if (closeLoading) {
            closeLoading()
            context.notification.success(
              `语音识别模型 (Vosk: ${MODEL_NAME}) 加载成功，已就绪`,
              '语音识别'
            )
          }

          return model
        } catch (err) {
          console.error('Vosk 模型加载失败:', err)
          if (closeLoading) {
            closeLoading()
            context.notification.error(
              `模型加载失败: ${err instanceof Error ? err.message : String(err)}`,
              '语音识别'
            )
          }
          modelLoadingPromise = null
          throw err
        }
      })()

      return modelLoadingPromise
    }

    initModel(false).catch((err) => {
      console.error('后台预加载 Vosk 模型失败:', err)
    })

    context.registerHook(
      'speech.stream.start',
      async (options: {
        sampleRate: number
        providerId?: string
        onResult?: (text: string) => void
        onPartial?: (text: string) => void
      }) => {
        try {
          const { sampleRate, providerId, onResult, onPartial } = options

          // 检查是否是注册的提供商
          const registeredProviders = context.getRegisteredProviders()
          const isRegistered = registeredProviders.some((p) => p.providerId === providerId)

          if (!isRegistered) {
            console.log(`Provider ${providerId} is not registered for Vosk. Skipping.`)
            return { success: false, skip: true }
          }

          const m = await initModel(false) // 钩子调用时如果还没加载完，显示加载提示
          if (recognizer) {
            recognizer.remove()
          }
          recognizer = new m.KaldiRecognizer(sampleRate)

          recognizer.on('result', (message: any) => {
            const result = message.result?.text || message.text
            if (result && onResult) {
              onResult(result)
            }
          })

          recognizer.on('partialresult', (message: any) => {
            const partial = message.result?.partial || message.partial
            if (partial && onPartial) {
              onPartial(partial)
            }
          })

          return { success: true }
        } catch (err) {
          console.error('Vosk 启动失败:', err)
          return { success: false, error: String(err) }
        }
      }
    )

    context.registerHook(
      'speech.stream.data',
      async (options: { data: Float32Array; sampleRate: number }) => {
        if (recognizer) {
          recognizer.acceptWaveformFloat(options.data, options.sampleRate)
        }
      }
    )

    // 注册停止识别钩子
    context.registerHook('speech.stream.stop', async () => {
      if (recognizer) {
        recognizer.remove()
        recognizer = null
        return { success: true }
      }
      return null
    })

    context.registerHook('speech.recognize', async () => {
      try {
        await initModel()
        return { text: '识别结果' }
      } catch (err) {
        console.error('Vosk 识别失败:', err)
        return { error: String(err) }
      }
    })
  },

  async uninstall(context) {
    // 注销 Vosk 提供商
    context.unregisterProvider('vosk-local')

    if (recognizer) {
      recognizer.remove()
      recognizer = null
    }
    if (model) {
      model.terminate()
      model = null
    }
    console.log('Vosk Speech Recognition 插件已卸载')
  }
}

export default plugin
