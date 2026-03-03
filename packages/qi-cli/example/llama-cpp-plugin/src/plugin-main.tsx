import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
  AIBeforeUseParams,
  LlamaLoadOptions,
  LlamaModelConfig,
  LlamaPluginConfig,
  OpenAICompatibleWithListModels,
  Plugin,
  PluginContext,
} from './types'
import { createModelGalleryComponent } from './model-gallery'
import {
  fetchModelScopeModelDetail,
  MODELSCOPE_BASE_URL,
  searchModelScopeModels,
} from './modelscope'
import {
  buildProviderModels,
  normalizeConfig,
  parseModelArgs,
  parseStoredConfig,
  resolveLoadedModelIdFromServer,
  scanModelsByRoot,
  syncScannedModels,
  toBaseURL,
} from './model-config'
import {
  DEFAULT_CONFIG,
  GGML_LOGO_DATA_URL,
  GGML_PROVIDER_LOGO_URL,
  PLUGIN_NAME,
  PROVIDER_ID,
  REGISTRY_ID,
  SERVICE_STATUS_ID,
  STORAGE_KEY,
} from './plugin-constants'
import {
  detectServerModelId,
  execCommand,
  getLlamaServerPathHint,
  isServerRunning,
  shellQuote,
  sleep,
  startLlamaServer,
  waitForServerReady,
} from './server-utils'
import { createServiceStatusRender } from './status-indicator'
let runtimeConfig: LlamaPluginConfig = { ...DEFAULT_CONFIG }
let isProgrammaticFormUpdate = false
let statusTimer: ReturnType<typeof setInterval> | null = null
let lastServiceRunning: boolean | null = null
let lastStatusLoadedModelId = ''
let isStatusPanelOpen = false
let onServiceStatusChanged: (() => void) | null = null
let lastRequestAt = Date.now()
let isIdleStopping = false
let hasManualLoadStarted = false
let currentProviderFormComponent: unknown = null
let isLoadingModel = false
let cancelLoadRequested = false
let loadingModelId = ''
let currentThinkingMode = false
let onModelLoadStateChanged: (() => void) | null = null
const setModelLoadingState = (loading: boolean, modelId = '') => {
  isLoadingModel = loading
  loadingModelId = modelId
  onModelLoadStateChanged?.()
}
const saveConfig = async (context: PluginContext, cfg: LlamaPluginConfig) => {
  runtimeConfig = normalizeConfig(cfg, runtimeConfig, DEFAULT_CONFIG)
  await context.localforage.setItem(STORAGE_KEY, runtimeConfig)
}
const updateServiceStatusIndicator = async (context: PluginContext, force = false) => {
  let running = lastServiceRunning ?? false
  const shouldProbe = hasManualLoadStarted && (force || isStatusPanelOpen)
  if (!hasManualLoadStarted) {
    running = false
  } else if (shouldProbe) {
    running = await isServerRunning(runtimeConfig)
  }
  if (shouldProbe && !running && runtimeConfig.loadedModelId) {
    runtimeConfig = { ...runtimeConfig, loadedModelId: '' }
    await saveConfig(context, runtimeConfig)
    syncProvider(context)
  }
  if (!force && lastServiceRunning === running && lastStatusLoadedModelId === runtimeConfig.loadedModelId) {
    return
  }
  lastServiceRunning = running
  lastStatusLoadedModelId = runtimeConfig.loadedModelId
  const loadedName = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)?.name
  const tooltip = running
    ? `llama-server is running${loadedName ? ` (${loadedName})` : ''}`
    : 'llama-server is stopped'
  const statusRender = createServiceStatusRender({
    context,
    tooltip,
    running,
    runtimeConfig,
    isStatusPanelOpen,
    isLoadingModel,
    loadingModelId,
    ggmlLogoDataUrl: GGML_LOGO_DATA_URL,
    onPanelOpenChange: (open) => {
      isStatusPanelOpen = open
    },
    onPanelOpened: () => {
      startStatusPolling(context)
      void updateServiceStatusIndicator(context, true)
    },
    onPanelClosed: () => {
      stopStatusPolling()
    },
    onStop: async () => {
      const ok = await stopLlamaServer(context)
      if (ok) context.notification.success('llama-server stopped.', 'llama.cpp')
      else context.notification.error('Failed to stop llama-server.', 'llama.cpp')
    },
    onReload: async (model) => {
      const ok = await reloadModelNow(context, model)
      if (!ok) return
      await updateServiceStatusIndicator(context, true)
    },
    onCancelLoad: async () => {
      cancelLoadRequested = true
      context.notification.info('Cancelling model load...', 'llama.cpp')
      await updateServiceStatusIndicator(context, true)
    }
  })
  ;(context.notification.status as unknown as (
    id: string,
    text: string,
    options?: Record<string, unknown>
  ) => void)(SERVICE_STATUS_ID, '', {
    render: statusRender,
    tooltip,
    color: '#fff',
  })
  onServiceStatusChanged?.()
}
const stopStatusPolling = () => {
  if (!statusTimer) return
  clearInterval(statusTimer)
  statusTimer = null
}
const startStatusPolling = (context: PluginContext) => {
  if (statusTimer) return
  statusTimer = setInterval(() => {
    if (!hasManualLoadStarted || !runtimeConfig.loadedModelId) return
    void checkIdleAutoStop(context)
    void updateServiceStatusIndicator(context)
  }, 3000)
}
const syncProvider = (context: PluginContext, formComponent?: unknown) => {
  if (formComponent) currentProviderFormComponent = formComponent
  context.registerProvider(PROVIDER_ID, {
    name: 'llama.cpp Local',
    logo: GGML_PROVIDER_LOGO_URL,
    providerType: REGISTRY_ID,
    form: (currentProviderFormComponent || formComponent) as Record<string, unknown>,
    models: buildProviderModels(runtimeConfig, PLUGIN_NAME)
  } as Record<string, unknown>)
}
const stopLlamaServer = async (context: PluginContext): Promise<boolean> => {
  const platform = context.api.os.platform()
  const processName = context.api.path.basename(
    runtimeConfig.llamaServerPath || (platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  )
  try {
    if (platform === 'win32') {
      await execCommand(context, `taskkill /F /T /IM "${processName}"`)
    } else {
      const candidates = Array.from(new Set([processName, 'llama-server']))
      let stopped = false
      for (const candidate of candidates) {
        try {
          await execCommand(context, `pkill -f ${shellQuote(candidate)}`)
          stopped = true
          break
        } catch {
          // try next
        }
      }
      if (!stopped) throw new Error('No matching process')
    }
  } catch {
    // noop
  }
  for (let i = 0; i < 10; i++) {
    if (!(await isServerRunning(runtimeConfig))) {
      runtimeConfig = { ...runtimeConfig, loadedModelId: '' }
      await saveConfig(context, runtimeConfig)
      syncProvider(context)
      await updateServiceStatusIndicator(context)
      return true
    }
    await sleep(300)
  }
  await updateServiceStatusIndicator(context, true)
  return false
}
const askLoadOptions = async (
  context: PluginContext,
  model: LlamaModelConfig
): Promise<LlamaLoadOptions | null> => {
  const modal = context.useModal()
  const [LoadOptionsForm, formActions] = context.useForm<LlamaLoadOptions>({
    title: '加载参数',
    showHeader: false,
    fields: [
      { name: 'ctxSize', type: 'number', label: 'Context size (ctx-size)', required: true },
      { name: 'extraArgs', type: 'text', label: '额外参数' }
    ],
    initialData: {
      ctxSize: runtimeConfig.ctxSize,
      extraArgs: runtimeConfig.extraArgs
    }
  })
  const ok = await modal.confirm({
    title: `加载 ${model.name}`,
    content: LoadOptionsForm
  })
  if (!ok) return null
  const data = formActions.getData()
  return {
    ctxSize: Number(data.ctxSize) > 0 ? Math.floor(Number(data.ctxSize)) : runtimeConfig.ctxSize,
    extraArgs: String(data.extraArgs || '').trim()
  }
}
const loadModelNow = async (
  context: PluginContext,
  model: LlamaModelConfig,
  presetLoadOptions?: LlamaLoadOptions
): Promise<boolean> => {
  if (isLoadingModel) {
    context.notification.warning('A model is loading. Cancel current load first.', 'llama.cpp')
    return false
  }
  hasManualLoadStarted = true
  if (await isServerRunning(runtimeConfig)) {
    if (runtimeConfig.loadedModelId === model.id) {
      context.notification.success(`${model.name} is already loaded.`, 'llama.cpp')
      return true
    }
    context.notification.warning('llama-server is running. Stop current service first.', 'llama.cpp')
    return false
  }
  const loadOptions = presetLoadOptions || await askLoadOptions(context, model)
  if (!loadOptions) return false
  context.notification.info(`Loading model: ${model.name}`, 'llama.cpp')
  setModelLoadingState(true, model.id)
  cancelLoadRequested = false
  await updateServiceStatusIndicator(context)
  const started = await startLlamaServer(context, runtimeConfig, model, loadOptions)
  if (!started) {
    setModelLoadingState(false)
    await updateServiceStatusIndicator(context, true)
    return false
  }
  const ready = await waitForServerReady(runtimeConfig, 30, 1000, () => cancelLoadRequested)
  if (cancelLoadRequested) {
    await stopLlamaServer(context)
    setModelLoadingState(false)
    cancelLoadRequested = false
    context.notification.warning(`Model load cancelled: ${model.name}`, 'llama.cpp')
    return false
  }
  if (!ready) {
    setModelLoadingState(false)
    context.notification.error('Model load timeout. Please check settings.', 'llama.cpp')
    return false
  }
  runtimeConfig = { ...runtimeConfig, loadedModelId: model.id }
  lastRequestAt = Date.now()
  await saveConfig(context, runtimeConfig)
  syncProvider(context)
  setModelLoadingState(false)
  await updateServiceStatusIndicator(context, true)
  context.notification.success(`Model loaded: ${model.name}`, 'llama.cpp')
  return true
}
const reloadModelNow = async (context: PluginContext, model: LlamaModelConfig): Promise<boolean> => {
  const loadOptions = await askLoadOptions(context, model)
  if (!loadOptions) return false
  if (await isServerRunning(runtimeConfig)) {
    const loadedModel = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)
    const confirmed = await context.useModal().confirm({
      title: 'Switch model',
      content: `Stop current service (${loadedModel?.name || runtimeConfig.loadedModelId || 'unknown'}) and load ${model.name}?`
    })
    if (!confirmed) return false
    const stopped = await stopLlamaServer(context)
    if (!stopped) {
      context.notification.error('Failed to stop current llama-server.', 'llama.cpp')
      return false
    }
  }
  return await loadModelNow(context, model, loadOptions)
}
const checkIdleAutoStop = async (context: PluginContext): Promise<void> => {
  if (isIdleStopping) return
  const idleMinutes = Number(runtimeConfig.idleShutdownMinutes)
  if (!Number.isFinite(idleMinutes) || idleMinutes <= 0) return
  if (!(await isServerRunning(runtimeConfig)) || !runtimeConfig.loadedModelId) return
  const idleMs = Date.now() - lastRequestAt
  const thresholdMs = Math.floor(idleMinutes * 60 * 1000)
  if (idleMs < thresholdMs) return
  isIdleStopping = true
  try {
    await stopLlamaServer(context)
  } finally {
    isIdleStopping = false
    lastRequestAt = Date.now()
  }
}
const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'llama.cpp local provider plugin with auto scan model list and mmproj mapping',
  install: async (context: PluginContext) => {
    stopStatusPolling()
    const saved = await context.localforage.getItem(STORAGE_KEY)
    runtimeConfig = normalizeConfig(parseStoredConfig(saved), DEFAULT_CONFIG, DEFAULT_CONFIG)
    runtimeConfig = syncScannedModels(runtimeConfig, scanModelsByRoot(context, runtimeConfig.modelsRoot))
    if (await isServerRunning(runtimeConfig)) {
      hasManualLoadStarted = true
      const serverModelId = await detectServerModelId(runtimeConfig)
      const loadedModelId = resolveLoadedModelIdFromServer(context, runtimeConfig, serverModelId)
      runtimeConfig = { ...runtimeConfig, loadedModelId: loadedModelId || runtimeConfig.loadedModelId }
    } else {
      hasManualLoadStarted = false
      runtimeConfig = { ...runtimeConfig, loadedModelId: '' }
    }
    await saveConfig(context, runtimeConfig)
    let currentModelPickerModal: ReturnType<PluginContext['useModal']> | null = null
    let formActions: any = null
    let ConfigForm: unknown = null
    const pickMmprojForModel = async (model: LlamaModelConfig) => {
      const result = await context.api.showOpenDialog({
        title: `为 ${model.name} 选择 mmproj`,
        properties: ['openFile'],
        filters: [{ name: 'GGUF', extensions: ['gguf'] }]
      })
      if (result?.canceled || !result?.filePaths?.[0]) return
      runtimeConfig = {
        ...runtimeConfig,
        mmprojMap: { ...(runtimeConfig.mmprojMap || {}), [model.id]: result.filePaths[0] }
      }
      await saveConfig(context, runtimeConfig)
      formActions?.setFieldValue('mmprojMap', runtimeConfig.mmprojMap)
      syncProvider(context, ConfigForm)
    }
    const openModelPickerModal = async () => {
      const modal = context.useModal()
      currentModelPickerModal = modal
      const ModelGallery = createModelGalleryComponent({
        context,
        getConfig: () => runtimeConfig,
        getLoadingState: () => ({ loading: isLoadingModel, loadingModelId }),
        subscribeLoadingState: (listener) => { onModelLoadStateChanged = listener },
        unsubscribeLoadingState: (listener) => {
          if (onModelLoadStateChanged === listener) onModelLoadStateChanged = null
        },
        pickMmprojForModel,
        loadLocalModel: async (model) => {
          const ok = await reloadModelNow(context, model)
          if (!ok) return false
          formActions?.setFieldValue('loadedModelId', runtimeConfig.loadedModelId)
          syncProvider(context, ConfigForm)
          await updateServiceStatusIndicator(context, true)
          currentModelPickerModal?.remove()
          return true
        },
        searchRemoteModels: (keyword) => searchModelScopeModels(keyword, GGML_LOGO_DATA_URL),
        fetchRemoteDetail: (modelId) => fetchModelScopeModelDetail(modelId, GGML_LOGO_DATA_URL),
        ggmlLogoDataUrl: GGML_LOGO_DATA_URL,
        modelscopeBaseUrl: MODELSCOPE_BASE_URL
      })
      await modal.confirm({
        title: '模型加载',
        width: '1180px',
        showCancel: false,
        confirmText: '关闭',
        content: ModelGallery
      })
      currentModelPickerModal = null
    }
    const renderModelSelector = () => {
      const Select = context.components?.Select as any
      const Button = context.components?.Button as any
      const loadedModel = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)
      const loadedModelName = loadedModel?.name || '未加载'
      const loadedModelId = runtimeConfig.loadedModelId || '__none__'
      if (Select) {
        return (
          <div title="点击打开模型列表" onClick={() => { void openModelPickerModal() }} style="cursor:pointer;">
            <Select
              modelValue={loadedModelId}
              options={[{ label: loadedModelName, value: loadedModelId }]}
              clearable={false}
              style="pointer-events:none;"
            />
          </div>
        )
      }
      if (Button) {
        return (
          <Button type="button" size="sm" variant="secondary" onClick={() => { void openModelPickerModal() }}>
            {loadedModelName}
          </Button>
        )
      }
      return <button type="button" onClick={() => { void openModelPickerModal() }}>{loadedModelName}</button>
    }
    const [FormComp, actions] = context.useForm<LlamaPluginConfig>({
      title: 'llama.cpp',
      showHeader: false,
      fields: () => {
        const platform = context.api.os.platform()
        return [
          {
            name: 'llamaServerPath',
            type: 'path',
            label: 'llama-server 路径',
            required: true,
            hint: getLlamaServerPathHint(platform),
            dialogOptions: { properties: ['openFile'] }
          },
          {
            name: 'modelsRoot',
            type: 'path',
            label: '模型根目录',
            required: true,
            hint: '路径变更时会自动重新扫描模型。',
            dialogOptions: { properties: ['openDirectory'] }
          },
          {
            name: 'loadedModelId',
            type: 'custom',
            label: '模型加载',
            hint: '点击选择框弹出模型列表并加载。',
            render: () => renderModelSelector()
          },
          { name: 'ctxSize', type: 'number', label: '默认上下文长度（ctx-size）', required: true, defaultValue: 4096 },
          { name: 'extraArgs', type: 'text', label: '默认额外参数', hint: '可选参数，例如：--n-gpu-layers 40 --threads 12' },
          { name: 'idleShutdownMinutes', type: 'number', label: '空闲自动停止（分钟）', required: true, defaultValue: 10 },
          { name: 'host', type: 'text', label: '服务地址', required: true, defaultValue: '127.0.0.1' },
          { name: 'port', type: 'number', label: '服务端口', required: true, defaultValue: 8080 },
          { name: 'apiKey', type: 'text', label: 'API 密钥', hint: '本地 llama-server 通常会忽略此项。' }
        ]
      },
      initialData: runtimeConfig,
      onChange: async (field, _value, data) => {
        if (isProgrammaticFormUpdate) return
        let next = normalizeConfig(data, runtimeConfig, DEFAULT_CONFIG)
        if (field === 'modelsRoot') {
          next = syncScannedModels(next, scanModelsByRoot(context, next.modelsRoot))
          isProgrammaticFormUpdate = true
          actions.setFieldValue('loadedModelId', next.loadedModelId)
          actions.setFieldValue('mmprojMap', next.mmprojMap)
          isProgrammaticFormUpdate = false
        }
        await saveConfig(context, next)
        await updateServiceStatusIndicator(context)
        syncProvider(context, FormComp)
      }
    })
    ConfigForm = FormComp
    formActions = actions
    onServiceStatusChanged = () => {
      formActions?.setFieldValue('loadedModelId', runtimeConfig.loadedModelId)
    }
    context.registerRegistry(REGISTRY_ID, () => {
      const provider = createOpenAICompatible({
        name: 'llama.cpp',
        baseURL: toBaseURL(runtimeConfig),
        apiKey: runtimeConfig.apiKey,
        transformRequestBody: (args) => {
          const request = { ...(args || {}) }
          const chatTemplateKwargs = {
            ...((request.chat_template_kwargs && typeof request.chat_template_kwargs === 'object')
              ? request.chat_template_kwargs
              : {}),
            enable_thinking: currentThinkingMode
          }
          return { ...request, enable_thinking: currentThinkingMode, chat_template_kwargs: chatTemplateKwargs }
        }
      }) as OpenAICompatibleWithListModels
      provider.listModels = async () => {
        const localModels = buildProviderModels(runtimeConfig, PLUGIN_NAME)
        if (localModels.length) return localModels
        try {
          const response = await fetch(`${toBaseURL(runtimeConfig)}/models`, {
            headers: { Authorization: `Bearer ${runtimeConfig.apiKey || 'sk-local'}` }
          })
          const json = await response.json() as { data?: Array<{ id: string }> }
          return (json.data || []).map((item) => ({
            id: item.id,
            name: item.id,
            category: 'text',
            active: true,
            object: 'model',
            created: Date.now(),
            owned_by: PLUGIN_NAME
          }))
        } catch {
          return []
        }
      }
      return provider
    })
    syncProvider(context, FormComp)
    lastRequestAt = Date.now()
    await updateServiceStatusIndicator(context, true)
    stopStatusPolling()
    context.registerHook('ai:before-use', async (...args: unknown[]) => {
      const params = (args[0] || {}) as AIBeforeUseParams
      if (params?.providerType !== REGISTRY_ID) return
      lastRequestAt = Date.now()
      try {
        const settingsStoreUnknown = await context.getStore('settings')
        const settingsStore = settingsStoreUnknown as { thinkingMode?: boolean | { value?: boolean } }
        const thinkingModeRaw = settingsStore?.thinkingMode
        if (typeof thinkingModeRaw === 'boolean') currentThinkingMode = thinkingModeRaw
        else if (thinkingModeRaw && typeof thinkingModeRaw === 'object' && typeof thinkingModeRaw.value === 'boolean') {
          currentThinkingMode = thinkingModeRaw.value
        }
      } catch {
        // noop
      }
    })
  },
  uninstall: async (context: PluginContext) => {
    stopStatusPolling()
    onServiceStatusChanged = null
    onModelLoadStateChanged = null
    lastServiceRunning = null
    lastStatusLoadedModelId = ''
    isStatusPanelOpen = false
    context.notification.removeStatus(SERVICE_STATUS_ID)
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(REGISTRY_ID)
  }
}
export default plugin
