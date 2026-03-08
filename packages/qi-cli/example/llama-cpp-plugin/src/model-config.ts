import {
  FileStatLike,
  LlamaEmbeddingPooling,
  LlamaConfigInput,
  LlamaLoadOptions,
  LlamaModelCategory,
  LlamaModelConfig,
  LlamaPluginConfig,
  Model,
  PluginContext
} from './types'

export const parseStoredConfig = (raw: unknown): LlamaConfigInput => {
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
  const categoryRaw = String(raw?.category || '').trim().toLowerCase()
  const category: LlamaModelCategory = categoryRaw === 'embedding' ? 'embedding' : 'text'
  const poolingRaw = String(raw?.embeddingPooling || '').trim().toLowerCase()
  const embeddingPooling: LlamaEmbeddingPooling | undefined = category === 'embedding'
    ? (['none', 'mean', 'cls', 'last', 'rank'].includes(poolingRaw) ? poolingRaw as LlamaEmbeddingPooling : 'cls')
    : undefined
  return { id, name, modelPath, category, embeddingPooling }
}

export const normalizeConfig = (
  raw: LlamaConfigInput,
  fallback: Partial<LlamaPluginConfig> | undefined,
  defaults: LlamaPluginConfig
): LlamaPluginConfig => {
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

  const host = String(raw?.host ?? base.host ?? defaults.host).trim() || defaults.host
  const portNumber = Number(raw?.port)
  const basePort = Number(base.port)
  const port = Number.isFinite(portNumber) && portNumber > 0
    ? Math.floor(portNumber)
    : (Number.isFinite(basePort) && basePort > 0 ? Math.floor(basePort) : defaults.port)
  const ctxSizeNumber = Number(raw?.ctxSize)
  const baseCtxSize = Number(base.ctxSize)
  const ctxSize = Number.isFinite(ctxSizeNumber) && ctxSizeNumber > 0
    ? Math.floor(ctxSizeNumber)
    : (Number.isFinite(baseCtxSize) && baseCtxSize > 0 ? Math.floor(baseCtxSize) : defaults.ctxSize)
  const idleMinutesNumber = Number(raw?.idleShutdownMinutes)
  const baseIdleMinutes = Number(base.idleShutdownMinutes)
  const idleShutdownMinutes = Number.isFinite(idleMinutesNumber) && idleMinutesNumber >= 0
    ? Math.floor(idleMinutesNumber)
    : (Number.isFinite(baseIdleMinutes) && baseIdleMinutes >= 0 ? Math.floor(baseIdleMinutes) : defaults.idleShutdownMinutes)
  const apiKey = raw?.apiKey !== undefined
    ? String(raw.apiKey ?? '').trim()
    : String(base.apiKey ?? defaults.apiKey).trim()

  return {
    apiKey,
    host,
    port,
    ctxSize,
    extraArgs: String(raw?.extraArgs ?? base.extraArgs ?? '').trim(),
    idleShutdownMinutes,
    autoStartLlamaServer: Boolean(raw?.autoStartLlamaServer ?? base.autoStartLlamaServer ?? defaults.autoStartLlamaServer),
    llamaServerPath: String(raw?.llamaServerPath ?? base.llamaServerPath ?? '').trim(),
    modelsRoot: String(raw?.modelsRoot ?? base.modelsRoot ?? '').trim(),
    loadedModelId,
    models,
    mmprojMap
  }
}

export const toBaseURL = (cfg: LlamaPluginConfig): string => {
  return `http://${cfg.host}:${cfg.port}/v1`
}

export const toHealthURLs = (cfg: LlamaPluginConfig): string[] => {
  const base = `http://${cfg.host}:${cfg.port}`
  return [`${base}/health`, `${base}/v1/models`]
}

export const splitExtraArgs = (extraArgs: string): string[] => {
  const result: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(extraArgs)) !== null) {
    result.push(match[1] ?? match[2] ?? match[3])
  }

  return result
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

      const entryLower = String(entry).toLowerCase()
      if (entryLower.endsWith('.gguf') && !entryLower.includes('mmproj')) {
        results.push(fullPath)
      }
    }
  }

  walk(root)
  return results
}

export const scanModelsByRoot = (context: PluginContext, root: string): LlamaModelConfig[] => {
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

export const syncScannedModels = (cfg: LlamaPluginConfig, scanned: LlamaModelConfig[]): LlamaPluginConfig => {
  const oldMap = cfg.mmprojMap || {}
  const oldModelMap = new Map(cfg.models.map((model) => [model.id, model]))
  const mmprojMap: Record<string, string> = {}

  const models = scanned.map((model) => {
    const existing = oldModelMap.get(model.id)
    mmprojMap[model.id] = oldMap[model.id] || ''
    return {
      ...model,
      category: existing?.category || model.category || 'text',
      embeddingPooling: (existing?.category || model.category) === 'embedding'
        ? (existing?.embeddingPooling || model.embeddingPooling || 'cls')
        : undefined
    }
  })

  const scannedIds = new Set(models.map((m) => m.id))
  const loadedModelId = scannedIds.has(cfg.loadedModelId) ? cfg.loadedModelId : ''

  return {
    ...cfg,
    models,
    loadedModelId,
    mmprojMap
  }
}

export const buildProviderModels = (cfg: LlamaPluginConfig, pluginName: string): Model[] => {
  const loaded = cfg.models.find((m) => m.id === cfg.loadedModelId)
  if (!loaded) return []

  return [{
    id: loaded.id,
    name: loaded.name,
    category: loaded.category || 'text',
    active: true,
    object: 'model',
    created: Date.now(),
    owned_by: pluginName,
    description: loaded.category === 'embedding'
      ? `${loaded.modelPath}${loaded.embeddingPooling ? `\nembedding pooling: ${loaded.embeddingPooling}` : ''}`
      : loaded.modelPath
  }] as Model[]
}

export const resolveLoadedModelIdFromServer = (
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

export const parseModelArgs = (
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

  const loadMmproj = loadOptions?.loadMmproj !== false
  const mmprojPath = String(cfg.mmprojMap?.[model.id] || '').trim()
  if ((model.category || 'text') !== 'embedding' && loadMmproj && mmprojPath) {
    args.push('--mmproj', mmprojPath)
  }

  if ((model.category || 'text') === 'embedding') {
    args.push('--embedding')
    if (model.embeddingPooling) {
      args.push('--pooling', model.embeddingPooling)
    }
  }

  const mergedExtraArgs = String(loadOptions?.extraArgs ?? cfg.extraArgs ?? '').trim()
  if (mergedExtraArgs) {
    args.push(...splitExtraArgs(mergedExtraArgs))
  }

  return args
}
