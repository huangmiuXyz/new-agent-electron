import { Plugin, PluginContext } from './types'
import * as Vosk from 'vosk-browser'

const STORAGE_KEY = 'vosk-config'
const MODEL_NAME = 'vosk-model-small-cn-0.22.zip'
const PROVIDER_ID = 'vosk-local'

let model: Vosk.Model | null = null
let recognizer: Vosk.KaldiRecognizer | null = null
let modelLoadingPromise: Promise<Vosk.Model | null> | null = null
let currentLoadedModelId: string | null = null
const MODELS = [
  {
    id: 'vosk-cn-small',
    name: 'Vosk 中文模型 (精简版)',
    file: 'vosk-model-small-cn-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-cn',
    name: 'Vosk 中文模型',
    file: 'vosk-model-cn-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-en-small',
    name: 'Vosk English Model (Small)',
    file: 'vosk-model-small-en-us-0.15.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-en',
    name: 'Vosk English Model',
    file: 'vosk-model-en-us-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-ru-small',
    name: 'Vosk Russian Model (Small)',
    file: 'vosk-model-small-ru-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-fr-small',
    name: 'Vosk French Model (Small)',
    file: 'vosk-model-small-fr-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-de-small',
    name: 'Vosk German Model (Small)',
    file: 'vosk-model-small-de-0.15.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-es-small',
    name: 'Vosk Spanish Model (Small)',
    file: 'vosk-model-small-es-0.42.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-pt-small',
    name: 'Vosk Portuguese Model (Small)',
    file: 'vosk-model-small-pt-0.3.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-it-small',
    name: 'Vosk Italian Model (Small)',
    file: 'vosk-model-small-it-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-ja-small',
    name: 'Vosk Japanese Model (Small)',
    file: 'vosk-model-small-ja-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-ko-small',
    name: 'Vosk Korean Model (Small)',
    file: 'vosk-model-small-ko-0.22.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-vn-small',
    name: 'Vosk Vietnamese Model (Small)',
    file: 'vosk-model-small-vn-0.4.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  },
  {
    id: 'vosk-tr-small',
    name: 'Vosk Turkish Model (Small)',
    file: 'vosk-model-small-tr-0.3.zip',
    active: false,
    category: 'speech',
    created: Date.now(),
    object: 'model',
    owned_by: 'vosk-speech-recognition'
  }
]
const plugin: Plugin = {
  name: 'Vosk 离线语音识别',
  version: '1.0.0',
  description: '使用 Vosk 实现完全本地化的离线语音转文字。',

  async install(context: PluginContext) {
    const { ref, h, onMounted, onUnmounted, markRaw, defineComponent, watch } = context.vue

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
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Vosk 离线语音识别</div>
              <div style={{ color: '#aaa' }}>
                当前模型: <span class="model-tag">{props.modelName}</span>
              </div>
            </div>
          </div>
        )
      }
    })

    const ErrorIcon = defineComponent({
      props: {
        error: { type: String, default: '' }
      },
      setup() {
        return () => (
          <div class="plugin-icon-container">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#ff4d4f">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
        )
      }
    })

    const settingsStore = await context.getStore('settings')
    const savedConfig = JSON.parse((await context.localforage.getItem(STORAGE_KEY)) || '{}')
    const DEFAULT_MODEL_PATH = context.getPluginsDataPath()
    const downloadApi = context.useDownload()

    let getFieldValue: any, setFieldValue: any, getFormData: any, setData: any, getData: any

    const getModelFilePath = (filename: string) => {
      let modelDir = ''
      try {
        if (typeof getFieldValue === 'function') {
          modelDir = getFieldValue('modelPath')
        } else {
          modelDir = savedConfig.modelPath ? savedConfig.modelPath : DEFAULT_MODEL_PATH
        }
      } catch (e) {
        modelDir = savedConfig.modelPath ? savedConfig.modelPath : DEFAULT_MODEL_PATH
      }
      if (!modelDir) modelDir = context.basePath || ''
      return context.api.path.join(modelDir, filename)
    }

    const checkFileExists = (file: string) => {
      if (!file) return true
      try {
        const fullPath = getModelFilePath(file)
        return context.api.fs.existsSync(fullPath)
      } catch (e) {
        return false
      }
    }

    const syncModels = async (newData: any[]) => {
      setData([...newData])
      setFieldValue('models', [...newData])
      const updatedConfig = { ...getFormData(), models: [...newData] }
      await context.localforage.setItem(STORAGE_KEY, JSON.stringify(updatedConfig))

      const index = settingsStore.registeredProviders.findIndex((p: any) => p.id === PROVIDER_ID)
      if (index !== -1) {
        const updatedProviders = [...settingsStore.registeredProviders]
        updatedProviders[index] = {
          ...updatedProviders[index],
          models: [...newData],
          ...updatedConfig
        }
        settingsStore.registeredProviders = updatedProviders
      }
    }

    const download = async (row: any) => {
      if (!row.file || (row.isDownloading && !row.isPaused)) return

      const newData = getData().map((item: any) =>
        item.id === row.id
          ? { ...item, isDownloading: true, isPaused: false, progress: item.progress || null }
          : item
      )
      await syncModels(newData)

      const fullPath = getModelFilePath(row.file)
      const url = `https://alphacephei.com/vosk/models/${row.file}`

      // 确保目录存在
      const modelDir = context.api.path.dirname(fullPath)
      if (!context.api.fs.existsSync(modelDir)) {
        context.api.fs.mkdirSync(modelDir, { recursive: true })
      }

      let localOffset = 0
      try {
        localOffset = context.api.fs.existsSync(fullPath) ? context.api.fs.statSync(fullPath).size : 0
      } catch {
      }

      try {
        const closeLoading = context.notification.loading(
          `${localOffset > 0 ? '正在续传' : '正在下载'}模型 ${row.name}...`,
          '模型下载'
        )
        try {
          await downloadApi.startDownload({
            id: row.id,
            url,
            destPath: fullPath,
            fileName: row.file,
            onProgress: (progress: any) => {
              const task = (downloadApi.tasks.value || []).find((t: any) => t.id === row.id)
              const isPaused = task?.status === 'paused'
              const isDownloading = task?.status === 'downloading'
              const updatedData = getData().map((item: any) =>
                item.id === row.id
                  ? {
                    ...item,
                    progress,
                    isPaused,
                    isDownloading
                  }
                  : item
              )
              setData(updatedData)
            },
            onSuccess: async () => {
              context.notification.success(`模型 ${row.name} 下载成功`, '模型下载')
              const updatedData = getData().map((item: any) =>
                item.id === row.id
                  ? {
                    ...item,
                    exists: true,
                    isDownloading: false,
                    isPaused: false,
                    isCompleted: true,
                    progress: null
                  }
                  : item
              )
              await syncModels(updatedData)
            },
            onError: async (error: string) => {
              context.notification.error(`下载失败: ${error}`, '模型下载')
              const currentData = getData().map((item: any) =>
                item.id === row.id ? { ...item, isDownloading: false, isPaused: false } : item
              )
              await syncModels(currentData)
            },
            onAborted: async (state: 'paused' | 'canceled' | 'aborted') => {
              const currentData = getData().map((item: any) =>
                item.id === row.id
                  ? {
                    ...item,
                    isDownloading: false,
                    isPaused: state === 'paused'
                  }
                  : item
              )
              await syncModels(currentData)
            }
          })
        } finally {
          closeLoading()
        }
      } catch (err: any) {
        const msg = err?.message || String(err)
        if (!msg.toLowerCase().includes('abort')) {
          context.notification.error(`下载失败: ${msg}`, '模型下载')
        }
        const currentData = getData().map((item: any) =>
          item.id === row.id ? { ...item, isDownloading: false, isPaused: false } : item
        )
        await syncModels(currentData)
      }
    }

    const deleteFile = async (row: any) => {
      if (!row.file) return
      try {
        const fullPath = getModelFilePath(row.file)
        if (context.api.fs.existsSync(fullPath)) {
          context.api.fs.unlinkSync(fullPath)
          context.notification.success(`模型文件 ${row.file} 已删除`, '模型管理')
          const newData = getData().map((item: any) =>
            item.id === row.id
              ? {
                  ...item,
                  exists: false,
                  isCompleted: false,
                  isDownloading: false,
                  isPaused: false,
                  progress: null
                }
              : item
          )
          await syncModels(newData)
        }
      } catch (err: any) {
        context.notification.error(`删除失败: ${err.message}`, '模型管理')
      }
    }

    let TableComponent: any
    ;[TableComponent, { setData, getData }] = context.useTable({
      data: [],
      columns: () => [
        { key: 'name', label: '模型名称', width: '2fr' },
        { key: 'id', label: '模型ID', width: '2fr' },
        {
          key: 'status',
          label: '状态/操作',
          width: '2fr',
          align: 'center',
          render: (row: any) => {
            if (row.isDownloading || row.isPaused) {
              return (
                <span
                  style={{
                    color: row.isPaused ? '#faad14' : '#1890ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px'
                  }}
                >
                  {row.isPaused ? '已暂停' : '下载中'}
                </span>
              )
            }
            if (row.exists && row.isCompleted) {
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
                onClick: () => download(row),
                variant: 'text'
              },
              () => {
                return {
                  icon: context.useIcon('Download')
                }
              }
            )
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
            return (
              <div style={{ display: 'flex', gap: '8px' }}>
                {context.components.Button(
                  {
                    size: 'sm',
                    variant: 'text',
                    disabled: !row.exists,
                    onClick: () => deleteFile(row)
                  },
                  () => {
                    return {
                      icon: context.useIcon('Delete')
                    }
                  }
                )}
              </div>
            )
          }
        }
      ]
    })

    let VoskForm: any
    ;[VoskForm, { getFieldValue, setFieldValue, getData: getFormData }] = context.useForm({
      fields: [
        {
          name: 'modelPath',
          type: 'path',
          label: '模型保存路径',
          placeholder: '留空使用默认内置模型',
          hint: `下载模型的保存路径`,
          dialogOptions: { properties: ['openDirectory'], title: '选择模型保存目录' }
        },
        {
          name: 'models',
          type: 'custom',
          render: () => {
            return <TableComponent />
          }
        }
      ],
      initialData: {
        modelPath: savedConfig.modelPath ? savedConfig.modelPath : DEFAULT_MODEL_PATH,
        models: (savedConfig.models && savedConfig.models.length > 0
          ? savedConfig.models
          : MODELS
        ).map((m: any) => ({
          ...m,
          exists: checkFileExists(m.file),
          isDownloading: m.isDownloading || false,
          isPaused: m.isPaused || false,
          isCompleted: m.isCompleted || false
        }))
      },
      onChange: (_field: string, _value: any, data: any) => {
        context.localforage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    })

    if (watch) {
      watch(
        () => getFieldValue('models'),
        (newModels: any[]) => {
          if (newModels && Array.isArray(newModels)) {
            const currentData = getData()
            const taskMap = new Map((downloadApi.tasks.value || []).map((task: any) => [task.id, task]))
            const mergedModels = newModels.map((m: any) => {
              const current = currentData.find((cm: any) => cm.id === m.id)
              const task = taskMap.get(m.id)
              const taskIsActive = task?.status === 'downloading' || task?.status === 'paused'
              if (
                current &&
                taskIsActive &&
                (current.isDownloading || current.isPaused) &&
                !m.isDownloading &&
                !m.isPaused
              ) {
                return { ...m, ...current }
              }
              return m
            })
            setData(mergedModels)
          }
        },
        { immediate: true, deep: true }
      )

      watch(
        () => downloadApi.tasks.value,
        (tasks: any[]) => {
          if (!tasks || !Array.isArray(tasks)) return
          const currentData = getData()
          if (!currentData || !Array.isArray(currentData)) return

          const taskMap = new Map(tasks.map((task: any) => [task.id, task]))
          const updatedData = currentData.map((item: any) => {
            const task = taskMap.get(item.id)
            if (!task) return item

            if (task.status === 'downloading') {
              return {
                ...item,
                isDownloading: true,
                isPaused: false,
                progress: task.progress || item.progress || null
              }
            }

            if (task.status === 'paused') {
              return {
                ...item,
                isDownloading: false,
                isPaused: true,
                progress: task.progress || item.progress || null
              }
            }

            if (task.status === 'completed') {
              return {
                ...item,
                exists: true,
                isCompleted: true,
                isDownloading: false,
                isPaused: false,
                progress: null
              }
            }

            if (task.status === 'error') {
              return {
                ...item,
                isDownloading: false,
                isPaused: false,
                progress: task.progress || item.progress || null
              }
            }

            if (task.status === 'canceled') {
              return {
                ...item,
                isDownloading: false,
                isPaused: false
              }
            }

            return item
          })

          setData(updatedData)
        },
        { deep: true, immediate: true }
      )
    }

    context.registerProvider(PROVIDER_ID, {
      name: 'Vosk',
      form: VoskForm,
      ...getFormData()
    })

    const initModel = async (silent = false) => {
      const selectedModelId = settingsStore.defaultModels?.speechModelId

      if (model && currentLoadedModelId !== selectedModelId) {
        model = null
        modelLoadingPromise = null
        if (recognizer) {
          recognizer.remove()
          recognizer = null
        }
      }

      if (model) return model
      if (modelLoadingPromise) return modelLoadingPromise

      modelLoadingPromise = (async () => {
        let closeLoading: (() => void) | null = null
        try {
          if (!context.api) throw new Error('应用 API 未就绪')

          if (settingsStore.defaultModels?.speechProviderId !== PROVIDER_ID) {
            modelLoadingPromise = null
            return null
          }

          const models = getFieldValue('models') || []
          const targetConfig = models.find((m: any) => m.id === selectedModelId)
          const targetFile = targetConfig?.file || MODEL_NAME
          const targetName = targetConfig?.name || targetFile

          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(LoadingIcon),
              color: '#fff',
              tooltip: `正在加载 Vosk 模型: ${targetName}...`
            })
            closeLoading = context.notification.loading(
              `正在初始化语音识别引擎并加载 Vosk 模型 (${targetName})...`,
              '语音识别'
            )
          }

          const fullPath = getModelFilePath(targetFile)
          const normalizedPath = fullPath.replace(/\\/g, '/')

          if (!context.api.fs.existsSync(fullPath)) {
            throw new Error(`找不到模型文件 ${targetFile}，请在插件设置中下载模型`)
          }

          const modelUrl = `plugin-resource://${normalizedPath}`

          model = await Vosk.createModel(modelUrl)
          currentLoadedModelId = selectedModelId

          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(() => <ReadyIcon modelName={targetName} />),
              color: '#fff',
              tooltip: `Vosk 语音识别已就绪 (模型: ${targetName})`
            })
            if (closeLoading) {
              closeLoading()
              context.notification.success(
                `语音识别模型 (Vosk: ${targetName}) 加载成功，已就绪`,
                '语音识别'
              )
            }
          }
          return model
        } catch (err) {
          console.error('Vosk 模型加载失败:', err)
          if (closeLoading) closeLoading()
          const errorMessage = err instanceof Error ? err.message : String(err)
          if (!silent) {
            context.notification.status('vosk-status', '', {
              render: markRaw(() => <ErrorIcon error={errorMessage} />),
              color: '#fff',
              tooltip: `Vosk 加载失败: ${errorMessage}`
            })
            context.notification.error(`模型加载失败: ${errorMessage}`, '语音识别')
          }
          modelLoadingPromise = null
          throw err
        }
      })()

      return modelLoadingPromise
    }

    // 监听默认提供商和具体模型的选择变化
    if (watch) {
      watch(
        [
          () => settingsStore.defaultModels?.speechProviderId,
          () => settingsStore.defaultModels?.speechModelId
        ],
        ([newProviderId]: [string, string]) => {
          if (newProviderId === PROVIDER_ID) {
            initModel(false).catch((err) => console.error('后台预加载 Vosk 模型失败:', err))
          } else {
            context.notification.removeStatus('vosk-status')
          }
        },
        { immediate: true }
      )
    }

    context.registerHook('speech.stream.start', async (options: any) => {
      try {
        const { sampleRate, providerId, onResult, onPartial } = options
        const isRegistered = context
          .getRegisteredProviders()
          .some((p) => p.providerId === providerId)

        if (!isRegistered) return { success: false, skip: true }

        const m = await initModel(false)
        if (!m) return { success: false, skip: true, error: 'Vosk 不是当前选中的提供商' }

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
        // 只有当 Vosk 是当前选中的提供商时才响应执行
        if (settingsStore.defaultModels?.speechProviderId !== PROVIDER_ID) {
          return { skip: true }
        }
        const m = await initModel()
        if (!m) return { skip: true }
        return { text: '识别结果' }
      } catch (err) {
        console.error('Vosk 识别失败:', err)
        return { error: String(err) }
      }
    })

    context.registerHook('plugin.clearData', async (data: { pluginName: string }) => {
      if (data.pluginName !== plugin.name) return
      const models = getFieldValue('models') || []
      for (const m of models) {
        if (m.file) {
          try {
            const fullPath = getModelFilePath(m.file)
            if (context.api.fs.existsSync(fullPath)) {
              context.api.fs.unlinkSync(fullPath)
            }
          } catch (e) {
            console.error(`删除模型文件 ${m.file} 失败:`, e)
          }
        }
      }
      // 重置模型状态
      const resetModels = MODELS.map((m: any) => ({
        ...m,
        exists: false,
        isCompleted: false,
        isDownloading: false,
        isPaused: false,
        progress: null
      }))
      await syncModels(resetModels)
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
  }
}

export default plugin
