import type { Model, Plugin, PluginContext } from '@agent-qi/types'

export type { Model, Plugin, PluginContext }

export interface LlamaModelConfig {
  id: string
  name: string
  modelPath: string
}

export interface LlamaPluginConfig {
  apiKey: string
  host: string
  port: number
  ctxSize: number
  extraArgs: string
  idleShutdownMinutes: number
  autoStartLlamaServer: boolean
  llamaServerPath: string
  modelsRoot: string
  loadedModelId: string
  models: LlamaModelConfig[]
  mmprojMap: Record<string, string>
}

export type LlamaConfigInput = Partial<LlamaPluginConfig> & {
  models?: Array<Partial<LlamaModelConfig>>
  mmprojMap?: Record<string, string | null | undefined>
}

export interface ScannedModelRow extends LlamaModelConfig {
  mmproj: string
  loaded: boolean
}

export interface FileStatLike {
  mode: number
}

export interface AIBeforeUseParams {
  model?: string
  providerType?: string
}

export interface LlamaLoadOptions {
  ctxSize: number
  extraArgs: string
}

export interface OpenAICompatibleWithListModels {
  listModels?: () => Promise<Model[]>
}
