import { Plugin, PluginContext } from './types'
import * as Vosk from 'vosk-browser'

const STORAGE_KEY = 'vosk-config'
const MODEL_NAME = 'vosk-model-small-cn-0.22.zip'
const PROVIDER_ID = 'vosk-local'

let model: Vosk.Model | null = null
let recognizer: Vosk.KaldiRecognizer | null = null
let modelLoadingPromise: Promise<Vosk.Model> | null = null

const plugin: Plugin = {
  name: 'vosk-speech-recognition',
  version: '1.0.0',
  description: 'Vosk 实时语音识别插件',

  async install(context: PluginContext) {
    const { ref, h, onMounted, onUnmounted, markRaw, defineComponent } = context.vue

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

        onUnmounted(() => clearInterval(timer))

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
        modelName: { type: String, required: true }
      },
      setup(props: any) {
        return () => (
          <div class="plugin-icon-container">
            <style>{`
              .plugin-icon-container { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100% }
              .plugin-tooltip {
                position: absolute; bottom: 100%; left: 0; transform: translateY(-8px);
                background: #ffffff; color: #333333; padding: 8px 12px; border-radius: 6px;
                font-size: 12px; white-space: nowrap; visibility: hidden; opacity: 0;
                transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000; border: 1px solid #e0e0e0;
              }
              html.dark-mode .plugin-tooltip { background: #2d2d2d; color: #ffffff; border-color: #444444; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
              .plugin-icon-container:hover .plugin-tooltip { visibility: visible; opacity: 1; transform: translateY(-12px); }
              .plugin-tooltip::after { content: ""; position: absolute; top: 100%; left: 10px; border: 6px solid transparent; border-top-color: #ffffff; }
              html.dark-mode .plugin-tooltip::after { border-top-color: #2d2d2d; }
              .model-tag { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-family: monospace; color: #007acc; }
              html.dark-mode .model-tag { background: #444444; color: #61dafb; }
            `}</style>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <div class="plugin-tooltip">
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Vosk 语音识别</div>
              <div style={{ color: '#aaa' }}>
                当前模型: <span class="model-tag">{props.modelName}</span>
              </div>
            </div>
          </div>
        )
      }
    })

    console.log('Vosk Speech Recognition 插件正在执行 install...')
    const settingsStore = await context.getStore('settings')
    const savedConfig = JSON.parse((await context.localforage.getItem(STORAGE_KEY)) || '{}')

    const syncModels = async (newData: any[]) => {
      setData(newData)
      setFieldValue('models', newData)
      const updatedConfig = { ...getFormData(), models: newData }
      await context.localforage.setItem(STORAGE_KEY, JSON.stringify(updatedConfig))

      const index = settingsStore.registeredProviders.findIndex((p: any) => p.id === PROVIDER_ID)
      if (index !== -1) {
        const updatedProviders = [...settingsStore.registeredProviders]
        updatedProviders[index] = { ...updatedProviders[index], models: newData }
        settingsStore.registeredProviders = updatedProviders
      }
    }

    const [TableComponent, { setData, getData }] = context.useTable({
      data: [],
      columns: () => [
        { key: 'name', label: '模型名称', width: '2fr' },
        { key: 'id', label: '模型ID', width: '2fr' },
        {
          key: 'status',
          label: '状态/操作',
          width: '2fr',
          render: (row: any) => {
            return defineComponent({
              setup() {
                const isDownloading = ref(false)
                const exists = ref(false)

                const checkExists = () => {
                  if (!row.file) {
                    exists.value = true
                    return
                  }
                  try {
                    const fullPath = context.api.path.join(context.basePath || '', row.file)
                    exists.value = context.api.fs.existsSync(fullPath)
                  } catch (e) {
                    console.error('Check exists error:', e)
                    exists.value = false
                  }
                }

                checkExists()

                const download = async () => {
                  if (!row.file) return
                  isDownloading.value = true
                  const fullPath = context.api.path.join(context.basePath || '', row.file)
                  const url = `https://alphacephei.com/vosk/models/${row.file}`

                  try {
                    const closeLoading = context.notification.loading(
                      `正在下载模型 ${row.name}...`,
                      '模型下载'
                    )
                    const result = await context.api.net.download({ url, destPath: fullPath })
                    closeLoading()

                    if (result.ok) {
                      context.notification.success(`模型 ${row.name} 下载成功`, '模型下载')
                      exists.value = true
                    } else {
                      throw new Error(result.error)
                    }
                  } catch (err: any) {
                    context.notification.error(`下载失败: ${err.message}`, '模型下载')
                  } finally {
                    isDownloading.value = false
                    checkExists()
                  }
                }

                return () => {
                  if (exists.value) {
                    return (
                      <span
                        style={{
                          color: '#52c41a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px'
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                        已就绪
                      </span>
                    )
                  }
                  return context.components.Button(
                    {
                      size: 'sm',
                      disabled: isDownloading.value,
                      onClick: download
                    },
                    '下载模型'
                  )
                }
              }
            })
          }
        },
        {
          key: 'active',
          label: '启用',
          width: '1fr',
          render: (row: any) =>
            context.components.Switch({
              modelValue: row.active,
              'onUpdate:modelValue': (val: boolean) => {
                const newData = getData().map((item: any) =>
                  item.id === row.id ? { ...item, active: val } : item
                )
                syncModels(newData)
              }
            })
        },
        {
          key: 'action',
          label: '操作',
          width: '1.5fr',
          render: (row: any) => {
            return defineComponent({
              setup() {
                const exists = ref(false)

                const checkExists = () => {
                  if (!row.file) return
                  try {
                    const fullPath = context.api.path.join(context.basePath || '', row.file)
                    exists.value = context.api.fs.existsSync(fullPath)
                  } catch (e) {
                    exists.value = false
                  }
                }

                checkExists()

                const deleteFile = async () => {
                  if (!row.file) return
                  try {
                    const fullPath = context.api.path.join(context.basePath || '', row.file)
                    if (context.api.fs.existsSync(fullPath)) {
                      context.api.fs.unlinkSync(fullPath)
                      context.notification.success(`模型文件 ${row.file} 已删除`, '模型管理')
                    }
                  } catch (err: any) {
                    context.notification.error(`删除失败: ${err.message}`, '模型管理')
                  }
                }

                return () => (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {context.components.Button(
                      {
                        danger: true,
                        size: 'sm',
                        disabled: !exists.value,
                        onClick: deleteFile
                      },
                      '删除模型文件'
                    )}
                  </div>
                )
              }
            })
          }
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
          dialogOptions: { properties: ['openFile'], title: '选择 Vosk 模型' }
        },
        {
          name: 'models',
          type: 'custom',
          render: (row: any) => {
            if (row.models && row.models.length > 0) {
              setData(row.models)
            }
            return TableComponent
          }
        }
      ],
      initialData: {
        modelPath: savedConfig.modelPath || '',
        models:
          savedConfig.models && savedConfig.models.length > 0
            ? savedConfig.models
            : [
                {
                  id: 'vosk-cn',
                  name: 'Vosk 中文模型',
                  file: MODEL_NAME,
                  active: true,
                  category: 'speech',
                  created: Date.now(),
                  object: 'model',
                  owned_by: 'vosk-speech-recognition'
                }
              ]
      },
      onChange: (_field: string, _value: any, data: any) => {
        context.localforage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    })

    context.registerProvider(PROVIDER_ID, {
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
          if (!context.api) throw new Error('应用 API 未就绪')

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
          const normalizedPath = (modelPath || fullPath).replace(/\\/g, '/')

          // 检查模型文件是否存在
          if (!modelPath && !context.api.fs.existsSync(fullPath)) {
            throw new Error(`找不到默认模型文件 ${MODEL_NAME}，请在插件设置中下载模型`)
          }

          const modelUrl = `plugin-resource://${normalizedPath}`

          console.log('正在加载 Vosk 模型:', modelUrl)
          model = await Vosk.createModel(modelUrl)

          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(() => <ReadyIcon modelName={MODEL_NAME} />),
              color: '#fff',
              tooltip: `Vosk 语音识别已就绪 (模型: ${MODEL_NAME})`
            })
            if (closeLoading) {
              closeLoading()
              context.notification.success(
                `语音识别模型 (Vosk: ${MODEL_NAME}) 加载成功，已就绪`,
                '语音识别'
              )
            }
          }
          return model
        } catch (err) {
          console.error('Vosk 模型加载失败:', err)
          if (closeLoading) closeLoading()
          if (!silent) {
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

    initModel(false).catch((err) => console.error('后台预加载 Vosk 模型失败:', err))

    context.registerHook('speech.stream.start', async (options: any) => {
      try {
        const { sampleRate, providerId, onResult, onPartial } = options
        const isRegistered = context
          .getRegisteredProviders()
          .some((p) => p.providerId === providerId)

        if (!isRegistered) return { success: false, skip: true }

        const m = await initModel(false)
        if (recognizer) recognizer.remove()
        recognizer = new m.KaldiRecognizer(sampleRate)

        recognizer.on('result', (message: any) => {
          const result = message.result?.text || message.text
          if (result && onResult) onResult(result)
        })

        recognizer.on('partialresult', (message: any) => {
          const partial = message.result?.partial || message.partial
          if (partial && onPartial) onPartial(partial)
        })

        return { success: true }
      } catch (err) {
        console.error('Vosk 启动失败:', err)
        return { success: false, error: String(err) }
      }
    })

    context.registerHook(
      'speech.stream.data',
      async (options: { data: Float32Array; sampleRate: number }) => {
        if (recognizer) recognizer.acceptWaveformFloat(options.data, options.sampleRate)
      }
    )

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
    context.unregisterProvider(PROVIDER_ID)
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
