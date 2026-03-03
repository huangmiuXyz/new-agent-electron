import ggmlLogoSvgRaw from '../GGML_logo.svg?raw'
import { LlamaPluginConfig } from './types'

export const PLUGIN_NAME = 'llama-cpp-plugin'
export const PROVIDER_ID = 'llama-cpp-local'
export const REGISTRY_ID = 'llama-cpp'
export const STORAGE_KEY = 'llama_cpp_plugin_config'
export const SERVICE_STATUS_ID = 'llama-cpp-service-status'

const GGML_LOGO_SVG = String(ggmlLogoSvgRaw || '')
  .replace(/width="[^"]*"/i, 'width="16"')
  .replace(/height="[^"]*"/i, 'height="16"')
  .replace(/fill="black"/gi, 'fill="currentColor"')
  .trim()

const GGML_PROVIDER_LOGO_SVG = GGML_LOGO_SVG
  .replace(/width="16"/i, 'width="24"')
  .replace(/height="16"/i, 'height="24"')
  .replace(/currentColor/g, '#6b7280')

export const GGML_PROVIDER_LOGO_URL = URL.createObjectURL(
  new Blob([GGML_PROVIDER_LOGO_SVG], { type: 'image/svg+xml;charset=utf-8' })
)

export const GGML_LOGO_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  GGML_LOGO_SVG.replace(/currentColor/g, '#6b7280')
)}`

export const DEFAULT_CONFIG: LlamaPluginConfig = {
  apiKey: '',
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

