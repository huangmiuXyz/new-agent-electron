import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import ggmlLogoSvgRaw from '../GGML_logo.svg?raw'
import {
  AIBeforeUseParams,
  FileStatLike,
  LlamaConfigInput,
  LlamaLoadOptions,
  LlamaModelConfig,
  LlamaPluginConfig,
  Model,
  OpenAICompatibleWithListModels,
  Plugin,
  PluginContext,
  ScannedModelRow
} from './types'

const PLUGIN_NAME = 'llama-cpp-plugin'
const PROVIDER_ID = 'llama-cpp-local'
const REGISTRY_ID = 'llama-cpp'
const STORAGE_KEY = 'llama_cpp_plugin_config'
const SERVICE_STATUS_ID = 'llama-cpp-service-status'
const GGML_LOGO_SVG = String(ggmlLogoSvgRaw || '')
  .replace(/width="[^"]*"/i, 'width="16"')
  .replace(/height="[^"]*"/i, 'height="16"')
  .replace(/fill="black"/gi, 'fill="currentColor"')
  .trim()
const GGML_PROVIDER_LOGO_SVG = GGML_LOGO_SVG
  .replace(/width="16"/i, 'width="24"')
  .replace(/height="16"/i, 'height="24"')
  .replace(/currentColor/g, '#6b7280')
const GGML_PROVIDER_LOGO_URL = URL.createObjectURL(
  new Blob([GGML_PROVIDER_LOGO_SVG], { type: 'image/svg+xml;charset=utf-8' })
)
const GGML_LOGO_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  GGML_LOGO_SVG.replace(/currentColor/g, '#6b7280')
)}`

const DEFAULT_CONFIG: LlamaPluginConfig = {
  apiKey: 'sk-local',
  host: '127.0.0.1',
  port: 8080,
  ctxSize: 4096,
  extraArgs: '',
  idleShutdownMinutes: 10,
  autoStartLlamaServer: true,
  llamaServerPath: '',
  modelsRoot: '',
  loadedModelId: '',
  models: [],
  mmprojMap: {}
}

let runtimeConfig: LlamaPluginConfig = { ...DEFAULT_CONFIG }
let isProgrammaticFormUpdate = false
let statusTimer: ReturnType<typeof setInterval> | null = null
let lastServiceRunning: boolean | null = null
let lastStatusLoadedModelId = ''
let onServiceStatusChanged: (() => void) | null = null
let lastRequestAt = Date.now()
let isIdleStopping = false
let hasManualLoadStarted = false
let isStatusPanelOpen = false
let currentProviderFormComponent: unknown = null
let isLoadingModel = false
let cancelLoadRequested = false
let loadingModelId = ''

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseStoredConfig = (raw: unknown): LlamaConfigInput => {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LlamaConfigInput
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') {
    return raw as LlamaConfigInput
  }
  return {}
}

const normalizeModel = (raw: Partial<LlamaModelConfig>, index: number): LlamaModelConfig => {
  const fallbackId = `local-model-${index + 1}`
  const modelPath = String(raw?.modelPath || '').trim()
  const id = String(raw?.id || fallbackId).trim() || fallbackId
  const name = String(raw?.name || id).trim() || id
  return { id, name, modelPath }
}

const normalizeConfig = (raw: LlamaConfigInput, fallback?: Partial<LlamaPluginConfig>): LlamaPluginConfig => {
  const base = fallback || {}
  const modelsRaw = Array.isArray(raw?.models)
    ? raw.models
    : (Array.isArray(base.models) ? base.models : [])
  const models = modelsRaw
    .map(normalizeModel)
    .filter((m) => Boolean(m.modelPath))

  const modelIds = new Set(models.map((m) => m.id))
  const mergedMapInput = {
    ...((base.mmprojMap && typeof base.mmprojMap === 'object') ? base.mmprojMap : {}),
    ...((raw?.mmprojMap && typeof raw.mmprojMap === 'object') ? raw.mmprojMap : {})
  }
  const mmprojMap = Object.fromEntries(
    Object.entries(mergedMapInput)
      .map(([k, v]) => [String(k), String(v ?? '').trim()])
      .filter(([k]) => modelIds.has(k))
  )

  const loadedModelIdRaw = String(raw?.loadedModelId || '').trim()
  const loadedModelId = modelIds.has(loadedModelIdRaw) ? loadedModelIdRaw : ''

  const host = String(raw?.host ?? base.host ?? DEFAULT_CONFIG.host).trim() || DEFAULT_CONFIG.host
  const portNumber = Number(raw?.port)
  const basePort = Number(base.port)
  const port = Number.isFinite(portNumber) && portNumber > 0
    ? Math.floor(portNumber)
    : (Number.isFinite(basePort) && basePort > 0 ? Math.floor(basePort) : DEFAULT_CONFIG.port)
  const ctxSizeNumber = Number(raw?.ctxSize)
  const baseCtxSize = Number(base.ctxSize)
  const ctxSize = Number.isFinite(ctxSizeNumber) && ctxSizeNumber > 0
    ? Math.floor(ctxSizeNumber)
    : (Number.isFinite(baseCtxSize) && baseCtxSize > 0 ? Math.floor(baseCtxSize) : DEFAULT_CONFIG.ctxSize)
  const idleMinutesNumber = Number(raw?.idleShutdownMinutes)
  const baseIdleMinutes = Number(base.idleShutdownMinutes)
  const idleShutdownMinutes = Number.isFinite(idleMinutesNumber) && idleMinutesNumber >= 0
    ? Math.floor(idleMinutesNumber)
    : (Number.isFinite(baseIdleMinutes) && baseIdleMinutes >= 0 ? Math.floor(baseIdleMinutes) : DEFAULT_CONFIG.idleShutdownMinutes)
  const apiKey = raw?.apiKey !== undefined
    ? String(raw.apiKey ?? '').trim()
    : String(base.apiKey ?? DEFAULT_CONFIG.apiKey).trim()

  return {
    apiKey,
    host,
    port,
    ctxSize,
    extraArgs: String(raw?.extraArgs ?? base.extraArgs ?? '').trim(),
    idleShutdownMinutes,
    autoStartLlamaServer: Boolean(raw?.autoStartLlamaServer ?? base.autoStartLlamaServer ?? DEFAULT_CONFIG.autoStartLlamaServer),
    llamaServerPath: String(raw?.llamaServerPath ?? base.llamaServerPath ?? '').trim(),
    modelsRoot: String(raw?.modelsRoot ?? base.modelsRoot ?? '').trim(),
    loadedModelId,
    models,
    mmprojMap
  }
}

const toBaseURL = (cfg: LlamaPluginConfig): string => {
  return `http://${cfg.host}:${cfg.port}/v1`
}

const toHealthURLs = (cfg: LlamaPluginConfig): string[] => {
  const base = `http://${cfg.host}:${cfg.port}`
  return [`${base}/health`, `${base}/v1/models`]
}

const splitExtraArgs = (extraArgs: string): string[] => {
  const result: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(extraArgs)) !== null) {
    result.push(match[1] ?? match[2] ?? match[3])
  }

  return result
}

const isServerRunning = async (cfg: LlamaPluginConfig): Promise<boolean> => {
  for (const url of toHealthURLs(cfg)) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // noop
    }
  }
  return false
}

const deriveModelIdFromPath = (context: PluginContext, filePath: string, fallbackId: string): string => {
  if (!filePath) return fallbackId
  try {
    return context.api.path.basename(filePath, '.gguf') || fallbackId
  } catch {
    return fallbackId
  }
}

const gatherGgufFiles = (context: PluginContext, root: string): string[] => {
  const results: string[] = []

  const walk = (dir: string) => {
    let entries: string[] = []
    try {
      entries = context.api.fs.readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = context.api.path.join(dir, entry)
      let stat: FileStatLike
      try {
        stat = context.api.fs.lstatSync(fullPath)
      } catch {
        continue
      }

      const isDir = (stat.mode & 0o170000) === 0o040000
      if (isDir) {
        walk(fullPath)
        continue
      }

      if (String(entry).toLowerCase().endsWith('.gguf')) {
        results.push(fullPath)
      }
    }
  }

  walk(root)
  return results
}

const scanModelsByRoot = (context: PluginContext, root: string): LlamaModelConfig[] => {
  if (!root || !context.api.fs.existsSync(root)) return []

  const files = gatherGgufFiles(context, root)
  return files.map((modelPath, index) => {
    const fallbackId = `local-model-${index + 1}`
    const id = deriveModelIdFromPath(context, modelPath, fallbackId)
    return {
      id,
      name: id,
      modelPath
    }
  })
}

const syncScannedModels = (cfg: LlamaPluginConfig, scanned: LlamaModelConfig[]): LlamaPluginConfig => {
  const oldMap = cfg.mmprojMap || {}
  const mmprojMap: Record<string, string> = {}

  for (const model of scanned) {
    mmprojMap[model.id] = oldMap[model.id] || ''
  }

  const scannedIds = new Set(scanned.map((m) => m.id))
  const loadedModelId = scannedIds.has(cfg.loadedModelId) ? cfg.loadedModelId : ''

  return {
    ...cfg,
    models: scanned,
    loadedModelId,
    mmprojMap
  }
}

const buildProviderModels = (cfg: LlamaPluginConfig): Model[] => {
  const loaded = cfg.models.find((m) => m.id === cfg.loadedModelId)
  if (!loaded) return []

  return [{
    id: loaded.id,
    name: loaded.name,
    category: 'text',
    active: true,
    object: 'model',
    created: Date.now(),
    owned_by: PLUGIN_NAME,
    description: loaded.modelPath
  }] as Model[]
}

const detectServerModelId = async (cfg: LlamaPluginConfig): Promise<string> => {
  try {
    const res = await fetch(`${toBaseURL(cfg)}/models`, {
      headers: {
        Authorization: `Bearer ${cfg.apiKey || 'sk-local'}`
      }
    })
    if (!res.ok) return ''
    const json = await res.json() as { data?: Array<{ id?: string }> }
    const id = String(json?.data?.[0]?.id || '').trim()
    return id
  } catch {
    return ''
  }
}

const resolveLoadedModelIdFromServer = (
  context: PluginContext,
  cfg: LlamaPluginConfig,
  serverModelId: string
): string => {
  const modelId = String(serverModelId || '').trim()
  if (!modelId) return ''
  const normalized = modelId.toLowerCase()
  const match = cfg.models.find((m) => {
    const idNorm = String(m.id || '').trim().toLowerCase()
    const pathNorm = context.api.path.basename(String(m.modelPath || '').trim(), '.gguf').toLowerCase()
    return idNorm === normalized || pathNorm === normalized
  })
  return match?.id || ''
}

const parseModelArgs = (
  cfg: LlamaPluginConfig,
  model: LlamaModelConfig,
  loadOptions?: LlamaLoadOptions
): string[] => {
  const ctxSize = Number.isFinite(Number(loadOptions?.ctxSize)) && Number(loadOptions?.ctxSize) > 0
    ? Math.floor(Number(loadOptions?.ctxSize))
    : cfg.ctxSize
  const args: string[] = [
    '--model', model.modelPath,
    '--ctx-size', String(ctxSize),
    '--host', cfg.host,
    '--port', String(cfg.port)
  ]

  const mmprojPath = String(cfg.mmprojMap?.[model.id] || '').trim()
  if (mmprojPath) {
    args.push('--mmproj', mmprojPath)
  }

  const mergedExtraArgs = String(loadOptions?.extraArgs ?? cfg.extraArgs ?? '').trim()
  if (mergedExtraArgs) {
    args.push(...splitExtraArgs(mergedExtraArgs))
  }

  return args
}

const startLlamaServer = async (
  context: PluginContext,
  cfg: LlamaPluginConfig,
  model: LlamaModelConfig,
  loadOptions?: LlamaLoadOptions
): Promise<boolean> => {
  if (!cfg.llamaServerPath) {
    context.notification.error('Please set llama-server path first.', 'llama.cpp')
    return false
  }

  if (!context.api.fs.existsSync(cfg.llamaServerPath)) {
    context.notification.error(`llama-server not found: ${cfg.llamaServerPath}`, 'llama.cpp')
    return false
  }

  if (!model.modelPath || !context.api.fs.existsSync(model.modelPath)) {
    context.notification.error(`Model file not found: ${model.modelPath || '(empty)'}`, 'llama.cpp')
    return false
  }

  const mmprojPath = String(cfg.mmprojMap?.[model.id] || '').trim()
  if (mmprojPath && !context.api.fs.existsSync(mmprojPath)) {
    context.notification.error(`mmproj file not found: ${mmprojPath}`, 'llama.cpp')
    return false
  }

  const args = parseModelArgs(cfg, model, loadOptions)

  try {
    const child = context.api.spawn(cfg.llamaServerPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })

    if (child && typeof child.unref === 'function') {
      child.unref()
    }
    return true
  } catch (error) {
    context.notification.error(`Failed to launch llama-server: ${(error as Error).message}`, 'llama.cpp')
    return false
  }
}

const waitForServerReady = async (
  cfg: LlamaPluginConfig,
  retries: number = 30,
  delayMs: number = 1000,
  shouldCancel?: () => boolean
): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    if (shouldCancel?.()) return false
    if (await isServerRunning(cfg)) return true
    await sleep(delayMs)
  }
  return false
}

const saveConfig = async (context: PluginContext, cfg: LlamaPluginConfig) => {
  runtimeConfig = normalizeConfig(cfg, runtimeConfig)
  await context.localforage.setItem(STORAGE_KEY, runtimeConfig)
}

const syncProvider = (context: PluginContext, formComponent?: unknown) => {
  if (formComponent) {
    currentProviderFormComponent = formComponent
  }
  context.registerProvider(PROVIDER_ID, {
    name: 'llama.cpp Local',
    logo: GGML_PROVIDER_LOGO_URL,
    providerType: REGISTRY_ID,
    form: (currentProviderFormComponent || formComponent) as Record<string, unknown>,
    models: buildProviderModels(runtimeConfig)
  } as Record<string, unknown>)

  // Fallback for hosts that don't yet persist `logo` from registerProvider options.
  void context.getStore('settings').then((settingsStoreUnknown) => {
    const settingsStore = settingsStoreUnknown as {
      registeredProviders?: Array<Record<string, unknown>>
    }
    const list = Array.isArray(settingsStore?.registeredProviders) ? settingsStore.registeredProviders : null
    if (!list) return
    const idx = list.findIndex(
      (p) => p?.providerId === PROVIDER_ID && p?.pluginName === PLUGIN_NAME
    )
    if (idx < 0) return
    const next = [...list]
    next[idx] = {
      ...next[idx],
      logo: GGML_PROVIDER_LOGO_URL
    }
    settingsStore.registeredProviders = next
  }).catch(() => {
    // noop
  })
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
    runtimeConfig = {
      ...runtimeConfig,
      loadedModelId: ''
    }
    await saveConfig(context, runtimeConfig)
    syncProvider(context)
  }

  if (!force && lastServiceRunning === running && lastStatusLoadedModelId === runtimeConfig.loadedModelId) {
    return
  }

  lastServiceRunning = running
  lastStatusLoadedModelId = runtimeConfig.loadedModelId

  const loadedModelName = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)?.name
  const tooltip = running
    ? `llama-server is running${loadedModelName ? ` (${loadedModelName})` : ''}`
    : 'llama-server is stopped'

  const statusRender = context.vue.markRaw(
    context.vue.defineComponent({
      setup() {
        const isOpen = context.vue.ref(isStatusPanelOpen)
        const wrapRef = context.vue.ref<HTMLElement | null>(null)
        const loadedModelId = runtimeConfig.loadedModelId
        const loadedModelName = runtimeConfig.models.find((m) => m.id === loadedModelId)?.name || 'None'
        const isLoaded = running && Boolean(loadedModelId)
        const loadingModelName = runtimeConfig.models.find((m) => m.id === loadingModelId)?.name || loadingModelId || 'Unknown'

        const onDocumentClick = (event: MouseEvent) => {
          const root = wrapRef.value
          if (!root) return
          const target = event.target as Node | null
          if (target && !root.contains(target)) {
            isOpen.value = false
            isStatusPanelOpen = false
          }
        }

        context.vue.onMounted(() => {
          document.addEventListener('mousedown', onDocumentClick)
        })

        context.vue.onUnmounted(() => {
          document.removeEventListener('mousedown', onDocumentClick)
          isStatusPanelOpen = false
        })

        const toggleOpen = async (e: MouseEvent) => {
          e.stopPropagation()
          isOpen.value = !isOpen.value
          isStatusPanelOpen = isOpen.value
          if (isOpen.value) {
            void updateServiceStatusIndicator(context, true)
          }
        }

        const handleStop = async (e: MouseEvent) => {
          e.stopPropagation()
          const ok = await stopLlamaServer(context)
          if (ok) {
            context.notification.success('llama-server stopped.', 'llama.cpp')
          } else {
            context.notification.error('Failed to stop llama-server.', 'llama.cpp')
          }
        }

        const handleReload = async (e: MouseEvent, model: LlamaModelConfig) => {
          e.stopPropagation()
          const ok = await reloadModelNow(context, model)
          if (!ok) return
          await updateServiceStatusIndicator(context, true)
        }

        const handleCancelLoading = async (e: MouseEvent) => {
          e.stopPropagation()
          cancelLoadRequested = true
          context.notification.info('Cancelling model load...', 'llama.cpp')
          await updateServiceStatusIndicator(context, true)
        }

        return () =>
          context.vue.h('div', { class: 'llama-status-wrap', ref: wrapRef }, [
            context.vue.h('style', {}, `
              .llama-status-wrap {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                padding: 0 6px;
              }
              .llama-status-tooltip {
                position: absolute;
                bottom: 100%;
                left: 0;
                transform: translateY(-8px);
                background: var(--bg-card);
                color: var(--text-primary);
                border: 1px solid var(--border-subtle);
                border-radius: 8px;
                padding: 10px;
                min-width: 280px;
                max-width: 360px;
                visibility: hidden;
                opacity: 0;
                transition: all 0.2s ease;
                box-shadow: var(--shadow-xl);
                z-index: 10000;
              }
              .llama-status-tooltip.open {
                visibility: visible;
                opacity: 1;
                transform: translateY(-12px);
              }
              .llama-status-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
              .llama-status-sub { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; word-break: break-all; }
              .llama-status-actions { display: flex; gap: 6px; margin-bottom: 8px; }
              .llama-status-btn {
                border: 1px solid var(--border-subtle);
                background: var(--bg-secondary);
                color: var(--text-primary);
                border-radius: 6px;
                font-size: 12px;
                padding: 3px 8px;
                cursor: pointer;
              }
              .llama-status-btn:hover { background: var(--bg-hover); }
              .llama-status-models { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
              .llama-status-model-row {
                width: 100%;
                text-align: left;
                border: 1px solid var(--border-subtle);
                background: transparent;
                color: var(--text-primary);
                border-radius: 6px;
                padding: 5px 8px;
                font-size: 12px;
                cursor: pointer;
              }
              .llama-status-model-row.active { border-color: var(--accent-color); color: var(--accent-color); }
              .llama-status-model-row:hover { background: var(--bg-hover); }
            `),
            context.vue.h('button', {
              type: 'button',
              onClick: toggleOpen,
              title: tooltip,
              style: 'display:flex;align-items:center;justify-content:center;padding:0;border:none;background:transparent;cursor:pointer;'
            }, [
              context.vue.h('div', { style: 'position:relative;display:flex;align-items:center;justify-content:center;width:16px;height:16px;' }, [
                context.vue.h('span', {
                  style: 'display:inline-flex;width:16px;height:16px;'
                }, [
                  context.vue.h('img', {
                    src: GGML_LOGO_DATA_URL,
                    alt: 'GGML',
                    style: `width:16px;height:16px;opacity:${isLoaded ? '1' : '0.85'};filter:${isLoaded ? 'none' : 'grayscale(1)'};`
                  })
                ]),
                context.vue.h('span', {
                  style: `position:absolute;right:-2px;bottom:-2px;width:6px;height:6px;border-radius:50%;background:${isLoaded ? '#16a34a' : '#6b7280'};border:1px solid var(--bg-card);`
                })
              ])
            ]),
            context.vue.h('div', { class: ['llama-status-tooltip', isOpen.value ? 'open' : ''] }, [
              context.vue.h('div', { class: 'llama-status-title' }, 'llama.cpp Service'),
              context.vue.h('div', { class: 'llama-status-sub' }, `Status: ${running ? 'Running' : 'Stopped'}`),
              ...(isLoadingModel
                ? [context.vue.h('div', { class: 'llama-status-sub' }, `Loading: ${loadingModelName}`)]
                : []),
              context.vue.h('div', { class: 'llama-status-sub' }, `Loaded: ${loadedModelName}`),
              context.vue.h('div', { class: 'llama-status-actions' }, [
                ...(running && Boolean(loadedModelId)
                  ? [context.vue.h('button', {
                      type: 'button',
                      class: 'llama-status-btn',
                      onClick: handleStop
                    }, 'Stop')]
                  : []),
                ...(isLoadingModel
                  ? [context.vue.h('button', {
                      type: 'button',
                      class: 'llama-status-btn',
                      onClick: handleCancelLoading
                    }, 'Cancel Load')]
                  : [])
              ]),
              context.vue.h('div', { class: 'llama-status-title', style: 'margin-bottom:4px;' }, 'Switch / Reload'),
              context.vue.h(
                'div',
                { class: 'llama-status-models' },
                runtimeConfig.models.length
                  ? runtimeConfig.models.map((m) =>
                      context.vue.h('button', {
                        type: 'button',
                        class: ['llama-status-model-row', m.id === loadedModelId ? 'active' : ''],
                        onClick: (e: MouseEvent) => handleReload(e, m)
                      }, m.name)
                    )
                  : [context.vue.h('div', { class: 'llama-status-sub', style: 'margin:0;' }, 'No scanned models.')]
              )
            ])
          ])
      }
    })
  )

  ;(context.notification.status as unknown as (
    id: string,
    text: string,
    options?: Record<string, unknown>
  ) => void)(SERVICE_STATUS_ID, '', {
    render: statusRender,
    color: '#fff',
    tooltip
  })

  onServiceStatusChanged?.()
}

const execCommand = async (context: PluginContext, command: string): Promise<{ stdout: string; stderr: string }> => {
  return await new Promise((resolve, reject) => {
    context.api.exec(command, { windowsHide: true }, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

const stopLlamaServer = async (context: PluginContext): Promise<boolean> => {
  const platform = context.api.os.platform()
  const processName = context.api.path.basename(runtimeConfig.llamaServerPath || 'llama-server.exe')

  try {
    if (platform === 'win32') {
      await execCommand(context, `taskkill /F /T /IM "${processName}"`)
    } else {
      await execCommand(context, 'pkill -f llama-server')
    }
  } catch {
    // Continue and check actual process status below.
  }

  for (let i = 0; i < 10; i++) {
    const running = await isServerRunning(runtimeConfig)
    if (!running) {
      runtimeConfig = {
        ...runtimeConfig,
        loadedModelId: ''
      }
      await saveConfig(context, runtimeConfig)
      syncProvider(context)
      await updateServiceStatusIndicator(context, true)
      return true
    }
    await sleep(300)
  }

  await updateServiceStatusIndicator(context, true)
  return false
}

const checkIdleAutoStop = async (context: PluginContext): Promise<void> => {
  if (isIdleStopping) return
  const idleMinutes = Number(runtimeConfig.idleShutdownMinutes)
  if (!Number.isFinite(idleMinutes) || idleMinutes <= 0) return

  const running = await isServerRunning(runtimeConfig)
  if (!running || !runtimeConfig.loadedModelId) return

  const idleMs = Date.now() - lastRequestAt
  const thresholdMs = Math.floor(idleMinutes * 60 * 1000)
  if (idleMs < thresholdMs) return

  isIdleStopping = true
  try {
    const loadedModel = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)
    context.notification.info(
      `No requests for ${idleMinutes} minutes, stopping ${loadedModel?.name || 'current model'}.`,
      'llama.cpp'
    )
    const stopped = await stopLlamaServer(context)
    if (stopped) {
      context.notification.success('llama-server auto-stopped due to inactivity.', 'llama.cpp')
    }
  } finally {
    isIdleStopping = false
    lastRequestAt = Date.now()
  }
}

const askLoadOptions = async (
  context: PluginContext,
  model: LlamaModelConfig
): Promise<LlamaLoadOptions | null> => {
  const modal = context.useModal()
  const [LoadOptionsForm, loadOptionsFormActions] = context.useForm<LlamaLoadOptions>({
    title: '加载参数',
    showHeader: false,
    fields: [
      {
        name: 'ctxSize',
        type: 'number',
        label: '上下文长度（ctx-size）',
        required: true
      },
      {
        name: 'extraArgs',
        type: 'text',
        label: '额外参数'
      }
    ],
    initialData: {
      ctxSize: runtimeConfig.ctxSize,
      extraArgs: runtimeConfig.extraArgs
    }
  })

  const result = await modal.confirm({
    title: `加载 ${model.name}`,
    content: LoadOptionsForm
  })

  if (!result) return null

  const data = loadOptionsFormActions.getData()
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
    context.notification.warning(
      'llama-server is already running. Stop current service first, then load another model.',
      'llama.cpp'
    )
    return false
  }

  const loadOptions = presetLoadOptions || await askLoadOptions(context, model)
  if (!loadOptions) {
    return false
  }

  context.notification.info(`Loading model: ${model.name}`, 'llama.cpp')
  isLoadingModel = true
  cancelLoadRequested = false
  loadingModelId = model.id
  await updateServiceStatusIndicator(context, true)

  const started = await startLlamaServer(context, runtimeConfig, model, loadOptions)
  if (!started) {
    isLoadingModel = false
    loadingModelId = ''
    await updateServiceStatusIndicator(context, true)
    return false
  }

  const ready = await waitForServerReady(runtimeConfig, 30, 1000, () => cancelLoadRequested)
  if (cancelLoadRequested) {
    await stopLlamaServer(context)
    isLoadingModel = false
    cancelLoadRequested = false
    loadingModelId = ''
    await updateServiceStatusIndicator(context, true)
    context.notification.warning(`Model load cancelled: ${model.name}`, 'llama.cpp')
    return false
  }
  if (!ready) {
    isLoadingModel = false
    loadingModelId = ''
    await updateServiceStatusIndicator(context, true)
    context.notification.error('Model load timeout. Please check settings.', 'llama.cpp')
    return false
  }

  runtimeConfig = {
    ...runtimeConfig,
    loadedModelId: model.id
  }
  lastRequestAt = Date.now()
  await saveConfig(context, runtimeConfig)
  syncProvider(context)
  isLoadingModel = false
  cancelLoadRequested = false
  loadingModelId = ''
  await updateServiceStatusIndicator(context, true)
  context.notification.success(`Model loaded: ${model.name}`, 'llama.cpp')
  return true
}

const reloadModelNow = async (
  context: PluginContext,
  model: LlamaModelConfig
): Promise<boolean> => {
  // Ask options first so user sees the popup immediately on click.
  const loadOptions = await askLoadOptions(context, model)
  if (!loadOptions) return false

  const running = await isServerRunning(runtimeConfig)
  if (running) {
    const loadedModel = runtimeConfig.models.find((m) => m.id === runtimeConfig.loadedModelId)
    const confirmed = await context.useModal().confirm({
      title: 'Switch model',
      content: `Stop current service (${loadedModel?.name || runtimeConfig.loadedModelId || 'unknown'}) and load ${model.name}?`
    })
    if (!confirmed) return false

    context.notification.info('Stopping current llama-server before reload...', 'llama.cpp')
    const stopped = await stopLlamaServer(context)
    if (!stopped) {
      context.notification.error('Failed to stop current llama-server.', 'llama.cpp')
      return false
    }
  }

  return await loadModelNow(context, model, loadOptions)
}

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'llama.cpp local provider plugin with auto scan model list and mmproj mapping',
  install: async (context: PluginContext) => {
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }

    const saved = await context.localforage.getItem(STORAGE_KEY)
    runtimeConfig = normalizeConfig(parseStoredConfig(saved), DEFAULT_CONFIG)
    runtimeConfig = syncScannedModels(runtimeConfig, scanModelsByRoot(context, runtimeConfig.modelsRoot))

    // Reconcile runtime state on plugin load: if server is already running,
    // reflect currently loaded model; otherwise clear stale loaded state.
    const runningAtInstall = await isServerRunning(runtimeConfig)
    if (runningAtInstall) {
      hasManualLoadStarted = true
      const serverModelId = await detectServerModelId(runtimeConfig)
      const loadedModelId = resolveLoadedModelIdFromServer(context, runtimeConfig, serverModelId)
      runtimeConfig = {
        ...runtimeConfig,
        loadedModelId: loadedModelId || runtimeConfig.loadedModelId
      }
    } else {
      hasManualLoadStarted = false
      if (runtimeConfig.loadedModelId) {
        runtimeConfig = {
          ...runtimeConfig,
          loadedModelId: ''
        }
      }
    }
    await saveConfig(context, runtimeConfig)

    const [ScannedModelTable, scannedModelTableActions] = context.useTable({
      columns: [
        { key: 'name', label: 'Model', width: '1fr' },
        {
          key: 'loaded',
          label: 'Loaded',
          width: '0.8fr',
          render: (row: ScannedModelRow) => {
            const Switch = context.components?.Switch
            if (!Switch) return row.loaded ? 'On' : 'Off'

            const onToggle = async (val: boolean) => {
              if (val) {
                await reloadModelNow(context, row)
              } else if (runtimeConfig.loadedModelId === row.id) {
                context.notification.warning(
                  'Unload is not supported from UI. Stop llama-server manually if needed.',
                  'llama.cpp'
                )
              }
              refreshScannedModelTable()
              formActions.setFieldValue('loadedModelId', runtimeConfig.loadedModelId)
              syncProvider(context, ConfigForm)
            }

            return context.vue.h(Switch, {
              modelValue: row.loaded,
              'onUpdate:modelValue': onToggle
            })
          }
        },
        { key: 'modelPath', label: 'Path', width: '2fr' },
        {
          key: 'mmproj',
          label: 'mmproj',
          width: '2fr',
          render: (row: ScannedModelRow) => {
            const Button = context.components?.Button
            const current = String(row.mmproj || '').trim()

            const pickMmproj = async () => {
              const result = await context.api.showOpenDialog({
                title: `Select mmproj for ${row.name}`,
                properties: ['openFile'],
                filters: [{ name: 'GGUF', extensions: ['gguf'] }]
              })
              if (result?.canceled || !result?.filePaths?.[0]) return

              runtimeConfig = {
                ...runtimeConfig,
                mmprojMap: {
                  ...(runtimeConfig.mmprojMap || {}),
                  [row.id]: result.filePaths[0]
                }
              }
              await saveConfig(context, runtimeConfig)
              refreshScannedModelTable()
              syncProvider(context, ConfigForm)
            }

            if (!current) {
              if (Button) {
                return context.vue.h(
                  Button,
                  { type: 'button', size: 'sm', variant: 'text', onClick: pickMmproj, title: 'Select mmproj' },
                  {
                    default: () => context.vue.h(
                      'svg',
                      { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'currentColor' },
                      [
                        context.vue.h('path', { d: 'M10 4l2 2h8v12H4V4h6zm-4 4v8h12V8H6z' })
                      ]
                    )
                  }
                )
              }
              return context.vue.h('button', { type: 'button', onClick: pickMmproj }, 'Folder')
            }

            return context.vue.h(
              'button',
              {
                type: 'button',
                onClick: pickMmproj,
                title: 'Click to reselect mmproj',
                style: 'border:none;background:transparent;padding:0;font-size:12px;color:var(--text-secondary);word-break:break-all;text-align:left;cursor:pointer;'
              },
              current
            )
          }
        }
      ],
      data: []
    })

    const refreshScannedModelTable = () => {
      const rows = runtimeConfig.models.map((m) => ({
        ...m,
        mmproj: String(runtimeConfig.mmprojMap?.[m.id] || '').trim(),
        loaded: m.id === runtimeConfig.loadedModelId
      }))
      scannedModelTableActions.setData(rows)
    }
    refreshScannedModelTable()
    onServiceStatusChanged = () => {
      refreshScannedModelTable()
    }
    lastRequestAt = Date.now()
    await updateServiceStatusIndicator(context, true)
    statusTimer = setInterval(() => {
      if (!hasManualLoadStarted || !runtimeConfig.loadedModelId) return
      if (!isStatusPanelOpen) return
      void checkIdleAutoStop(context)
      void updateServiceStatusIndicator(context)
    }, 3000)

    const renderScannedModelList = () => {
      if (!runtimeConfig.models.length) {
        return context.vue.h('div', { style: 'color:var(--text-secondary);font-size:12px' }, 'No GGUF model found in current models root.')
      }
      return context.vue.h(ScannedModelTable)
    }

    const [ConfigForm, formActions] = context.useForm({
      title: 'llama.cpp',
      showHeader: false,
      fields: () => {
        return [
          {
            name: 'llamaServerPath',
            type: 'path',
            label: 'llama-server 路径',
            required: true,
            hint: '示例：E:/llama.cpp/build/bin/Release/llama-server.exe',
            dialogOptions: {
              properties: ['openFile']
            }
          },
          {
            name: 'modelsRoot',
            type: 'path',
            label: '模型根目录',
            required: true,
            hint: '路径变化时会自动重新扫描模型。',
            dialogOptions: {
              properties: ['openDirectory']
            }
          },
          {
            name: 'scannedModelsReadonly',
            type: 'custom',
            render: () => renderScannedModelList()
          },
          {
            name: 'ctxSize',
            type: 'number',
            label: '默认上下文长度（ctx-size）',
            required: true,
            defaultValue: 4096
          },
          {
            name: 'extraArgs',
            type: 'text',
            label: '默认额外参数',
            hint: '可选全局参数，例如：--n-gpu-layers 40 --threads 12'
          },
          {
            name: 'idleShutdownMinutes',
            type: 'number',
            label: '空闲自动停止（分钟）',
            required: true,
            defaultValue: 10,
            hint: 'N 分钟内无请求则自动停止 llama-server；设为 0 表示禁用。'
          },
          {
            name: 'host',
            type: 'text',
            label: '服务地址',
            required: true,
            defaultValue: '127.0.0.1'
          },
          {
            name: 'port',
            type: 'number',
            label: '服务端口',
            required: true,
            defaultValue: 8080
          },
          {
            name: 'apiKey',
            type: 'text',
            label: 'API 密钥',
            hint: '本地 llama-server 通常会忽略此项。'
          }
        ]
      },
      initialData: runtimeConfig,
      onChange: async (
        field: keyof LlamaPluginConfig | undefined,
        _value: unknown,
        data: LlamaPluginConfig
      ) => {
        if (isProgrammaticFormUpdate) return

        let next = normalizeConfig(data, runtimeConfig)
        if (field === 'modelsRoot') {
          const scanned = scanModelsByRoot(context, next.modelsRoot)
          next = syncScannedModels(next, scanned)

          isProgrammaticFormUpdate = true
          formActions.setFieldValue('loadedModelId', next.loadedModelId)
          formActions.setFieldValue('mmprojMap', next.mmprojMap)
          isProgrammaticFormUpdate = false
        }

        await saveConfig(context, next)
        refreshScannedModelTable()
        await updateServiceStatusIndicator(context)
        syncProvider(context, ConfigForm)
      }
    })

    context.registerRegistry(REGISTRY_ID, () => {
      const provider = createOpenAICompatible({
        name: 'llama.cpp',
        baseURL: toBaseURL(runtimeConfig),
        apiKey: runtimeConfig.apiKey
      }) as OpenAICompatibleWithListModels

      provider.listModels = async () => {
        const localModels = buildProviderModels(runtimeConfig)
        if (localModels.length > 0) return localModels

        try {
          const response = await fetch(`${toBaseURL(runtimeConfig)}/models`, {
            headers: {
              Authorization: `Bearer ${runtimeConfig.apiKey || 'sk-local'}`
            }
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

    syncProvider(context, ConfigForm)
    context.registerHook('ai:before-use', async (...args: unknown[]) => {
      const params = (args[0] || {}) as AIBeforeUseParams
      if (params?.providerType !== REGISTRY_ID) return
      lastRequestAt = Date.now()
    })
  },

  uninstall: async (context: PluginContext) => {
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
    onServiceStatusChanged = null
    lastServiceRunning = null
    lastStatusLoadedModelId = ''
    isStatusPanelOpen = false
    context.notification.removeStatus(SERVICE_STATUS_ID)
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(REGISTRY_ID)
  }
}

export default plugin
