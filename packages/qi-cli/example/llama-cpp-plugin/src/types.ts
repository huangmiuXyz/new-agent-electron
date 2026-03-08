import type { Model, Plugin, PluginContext } from '@agent-qi/types'
import { OpenAICompatibleProvider } from '@ai-sdk/openai-compatible'
export type { Model, Plugin, PluginContext }

export type LlamaModelCategory = 'text' | 'embedding'
export type LlamaEmbeddingPooling = 'none' | 'mean' | 'cls' | 'last' | 'rank'

export interface LlamaModelConfig {
  id: string
  name: string
  modelPath: string
  category?: LlamaModelCategory
  embeddingPooling?: LlamaEmbeddingPooling
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
  loadMmproj: boolean
}

export interface OpenAICompatibleWithListModels extends OpenAICompatibleProvider<string, string, string, string>{
  listModels?: () => Promise<Model[]>
}
