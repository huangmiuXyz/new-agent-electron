import {
  LlamaLoadOptions,
  LlamaModelConfig,
  LlamaPluginConfig,
  PluginContext,
} from './types'
import { parseModelArgs, toBaseURL, toHealthURLs } from './model-config'

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const isServerRunning = async (cfg: LlamaPluginConfig): Promise<boolean> => {
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

export const detectServerModelId = async (cfg: LlamaPluginConfig): Promise<string> => {
  try {
    const res = await fetch(`${toBaseURL(cfg)}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey || 'sk-local'}` }
    })
    if (!res.ok) return ''
    const json = await res.json() as { data?: Array<{ id?: string }> }
    return String(json?.data?.[0]?.id || '').trim()
  } catch {
    return ''
  }
}

export const startLlamaServer = async (
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

  const loadMmproj = loadOptions?.loadMmproj !== false
  const mmprojPath = String(cfg.mmprojMap?.[model.id] || '').trim()
  if ((model.category || 'text') !== 'embedding' && loadMmproj && mmprojPath && !context.api.fs.existsSync(mmprojPath)) {
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
    if (child && typeof child.unref === 'function') child.unref()
    return true
  } catch (error) {
    context.notification.error(`Failed to launch llama-server: ${(error as Error).message}`, 'llama.cpp')
    return false
  }
}

export const waitForServerReady = async (
  cfg: LlamaPluginConfig,
  retries = 30,
  delayMs = 1000,
  shouldCancel?: () => boolean
): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    if (shouldCancel?.()) return false
    if (await isServerRunning(cfg)) return true
    await sleep(delayMs)
  }
  return false
}

export const execCommand = async (context: PluginContext, command: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    context.api.exec(command, { windowsHide: true }, (error: Error | null) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export const shellQuote = (value: string): string => `'${String(value).replace(/'/g, `'\\''`)}'`

export const getLlamaServerPathHint = (platform: string): string => {
  if (platform === 'win32') return '示例：G:/llama.cpp/build/bin/Release/llama-server.exe'
  if (platform === 'darwin') return '示例：/usr/local/bin/llama-server'
  return '示例：/usr/bin/llama-server'
}
