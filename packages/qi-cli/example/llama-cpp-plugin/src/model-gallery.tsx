import { LlamaModelConfig, LlamaPluginConfig, PluginContext } from './types'
import { RemoteModelCard } from './modelscope'

interface LoadingState {
  loading: boolean
  loadingModelId: string
}

interface CreateModelGalleryOptions {
  context: PluginContext
  getConfig: () => LlamaPluginConfig
  getLoadingState: () => LoadingState
  subscribeLoadingState: (listener: () => void) => void
  unsubscribeLoadingState: (listener: () => void) => void
  pickMmprojForModel: (model: LlamaModelConfig) => Promise<void>
  loadLocalModel: (model: LlamaModelConfig) => Promise<boolean>
  searchRemoteModels: (keyword: string) => Promise<RemoteModelCard[]>
  fetchRemoteDetail: (modelId: string) => Promise<RemoteModelCard | null>
  ggmlLogoDataUrl: string
  modelscopeBaseUrl: string
}

export const createModelGalleryComponent = (opts: CreateModelGalleryOptions) => {
  const { context } = opts
  const Button = context.components?.Button as any
  const Input = context.components?.Input as any

  return context.vue.markRaw(context.vue.defineComponent({
    setup() {
      const activeTab = context.vue.ref<'local' | 'download'>('local')
      const localModels = context.vue.ref<LlamaModelConfig[]>([])
      const localSelectedId = context.vue.ref('')
      const remoteKeyword = context.vue.ref('Qwen')
      const remoteLoading = context.vue.ref(false)
      const remoteError = context.vue.ref('')
      const remoteModels = context.vue.ref<RemoteModelCard[]>([])
      const remoteSelectedId = context.vue.ref('')
      const remoteDetailLoading = context.vue.ref(false)
      const remoteDetail = context.vue.ref<RemoteModelCard | null>(null)
      const loadingModel = context.vue.ref(false)
      const loadingId = context.vue.ref('')

      const formatAgo = (unix: number): string => {
        if (!unix) return '未知'
        const diff = Math.max(0, Math.floor(Date.now() / 1000) - unix)
        const day = 86400
        if (diff < 60) return `${diff}s`
        if (diff < 3600) return `${Math.floor(diff / 60)}m`
        if (diff < day) return `${Math.floor(diff / 3600)}h`
        return `${Math.floor(diff / day)}d`
      }

      const refreshLocalModels = () => {
        const cfg = opts.getConfig()
        localModels.value = [...cfg.models]
        if (!localSelectedId.value) {
          localSelectedId.value = cfg.loadedModelId || localModels.value[0]?.id || ''
        }
      }

      const syncLoadingState = () => {
        const state = opts.getLoadingState()
        loadingModel.value = state.loading
        loadingId.value = state.loadingModelId
      }

      const loadRemoteModels = async () => {
        remoteLoading.value = true
        remoteError.value = ''
        try {
          const rows = await opts.searchRemoteModels(remoteKeyword.value)
          remoteModels.value = rows
          if (!rows.length) {
            remoteSelectedId.value = ''
            remoteDetail.value = null
            return
          }
          const nextId = rows.find((m) => m.id === remoteSelectedId.value)?.id || rows[0].id
          remoteSelectedId.value = nextId
          const summary = rows.find((m) => m.id === nextId) || null
          remoteDetail.value = summary
          remoteDetailLoading.value = true
          remoteDetail.value = await opts.fetchRemoteDetail(nextId) || summary
        } catch (error) {
          remoteError.value = (error as Error)?.message || '加载在线模型失败。'
        } finally {
          remoteDetailLoading.value = false
          remoteLoading.value = false
        }
      }

      const loadRemoteDetail = async (modelId: string) => {
        remoteSelectedId.value = modelId
        remoteDetailLoading.value = true
        const summary = remoteModels.value.find((m) => m.id === modelId) || null
        remoteDetail.value = summary
        try {
          remoteDetail.value = await opts.fetchRemoteDetail(modelId) || summary
        } finally {
          remoteDetailLoading.value = false
        }
      }

      const renderButton = (label: string, props: Record<string, unknown> = {}) => {
        if (Button) {
          return <Button type="button" size="sm" {...(props as Record<string, unknown>)}>{label}</Button>
        }
        return <button type="button" {...(props as Record<string, unknown>)}>{label}</button>
      }

      context.vue.onMounted(() => {
        opts.subscribeLoadingState(syncLoadingState)
        syncLoadingState()
        refreshLocalModels()
        void loadRemoteModels()
      })

      context.vue.onUnmounted(() => {
        opts.unsubscribeLoadingState(syncLoadingState)
      })

      return () => (
        <div class="llama-model-gallery">
          <style>{`
            .llama-model-gallery { display: flex; flex-direction: column; gap: 12px; }
            .llama-model-tabs { display: flex; gap: 8px; }
            .llama-model-tab { border: 1px solid var(--border-subtle); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
            .llama-model-tab.active { color: var(--text-primary); border-color: var(--accent-color); background: color-mix(in srgb, var(--accent-color) 14%, transparent); }
            .llama-model-layout { display: grid; grid-template-columns: 44% 56%; gap: 10px; min-height: 500px; }
            .llama-model-pane { border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--bg-secondary); overflow: hidden; }
            .llama-pane-head { padding: 10px; border-bottom: 1px solid var(--border-subtle); }
            .llama-pane-body { max-height: 540px; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
            .llama-search-wrap { display: flex; gap: 8px; align-items: center; }
            .llama-search-input { flex: 1; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); color: var(--text-primary); padding: 8px 10px; font-size: 13px; }
            .llama-model-card { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1px solid var(--border-subtle); border-radius: 10px; padding: 8px; cursor: pointer; background: color-mix(in srgb, var(--bg-card) 88%, transparent); }
            .llama-model-card:hover { border-color: var(--accent-color); }
            .llama-model-card.active { border-color: var(--accent-color); background: color-mix(in srgb, var(--accent-color) 12%, var(--bg-card)); }
            .llama-model-card > div { min-width: 0; }
            .llama-model-cover { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; background: var(--bg-card); border: 1px solid var(--border-subtle); }
            .llama-model-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
            .llama-model-sub { min-width: 0; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .llama-model-tags { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
            .llama-detail { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
            .llama-detail-head { display: flex; gap: 10px; align-items: center; }
            .llama-detail-cover { width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border-subtle); object-fit: cover; background: var(--bg-card); }
            .llama-detail-name { font-size: 16px; font-weight: 600; color: var(--text-primary); word-break: break-all; }
            .llama-detail-id { font-size: 12px; color: var(--text-secondary); word-break: break-all; }
            .llama-detail-desc { border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); color: var(--text-secondary); font-size: 12px; line-height: 1.5; padding: 8px; white-space: pre-wrap; max-height: 300px; overflow: auto; }
            .llama-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .llama-light-text { color: var(--text-secondary); font-size: 12px; }
          `}</style>

          <div class="llama-model-tabs">
            {renderButton(`本地模型 (${localModels.value.length})`, {
              class: ['llama-model-tab', activeTab.value === 'local' ? 'active' : ''],
              variant: activeTab.value === 'local' ? 'primary' : 'secondary',
              onClick: () => { activeTab.value = 'local'; refreshLocalModels() }
            })}
            {renderButton('下载模型 (ModelScope)', {
              class: ['llama-model-tab', activeTab.value === 'download' ? 'active' : ''],
              variant: activeTab.value === 'download' ? 'primary' : 'secondary',
              onClick: () => { activeTab.value = 'download' }
            })}
          </div>

          <div class="llama-model-layout">
            <div class="llama-model-pane">
              <div class="llama-pane-head">
                {activeTab.value === 'download'
                  ? (
                    <div class="llama-search-wrap">
                      {Input
                        ? (
                          <Input
                            class="llama-search-input"
                            modelValue={remoteKeyword.value}
                            onUpdate:modelValue={(value: string | number) => { remoteKeyword.value = String(value || '') }}
                            onKeydown={(e: KeyboardEvent) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void loadRemoteModels()
                              }
                            }}
                            placeholder="在 ModelScope 搜索，例如 Qwen / deepseek / llama"
                            size="sm"
                          />
                        )
                        : (
                          <input
                            class="llama-search-input"
                            value={remoteKeyword.value}
                            placeholder="在 ModelScope 搜索，例如 Qwen / deepseek / llama"
                            onKeydown={(e: KeyboardEvent) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void loadRemoteModels()
                              }
                            }}
                            onInput={(e: Event) => { remoteKeyword.value = String((e.target as HTMLInputElement)?.value || '') }}
                          />
                        )}
                    </div>
                  )
                  : <div class="llama-light-text">本地模型来自 modelsRoot 扫描结果，可直接加载并配置 mmproj。</div>}
              </div>
              <div class="llama-pane-body">
                {activeTab.value === 'local'
                  ? (
                    localModels.value.length
                      ? localModels.value.map((model) => {
                        const cfg = opts.getConfig()
                        const isCurrent = model.id === cfg.loadedModelId
                        const currentMmproj = String(cfg.mmprojMap?.[model.id] || '').trim()
                        return (
                          <div class={['llama-model-card', localSelectedId.value === model.id ? 'active' : '']} onClick={() => { localSelectedId.value = model.id }}>
                            <img class="llama-model-cover" src={opts.ggmlLogoDataUrl} />
                            <div>
                              <div class="llama-model-title">{model.name}</div>
                              <div class="llama-model-sub" title={model.modelPath}>{model.modelPath}</div>
                              <div class="llama-model-sub" title={currentMmproj || '未设置'}>{`mmproj: ${currentMmproj || '未设置'}`}</div>
                            </div>
                          </div>
                        )
                      })
                      : <div class="llama-light-text">未扫描到本地模型，请先配置“模型根目录”。</div>
                  )
                  : remoteLoading.value
                    ? <div class="llama-light-text">正在从 ModelScope 获取模型列表...</div>
                    : remoteError.value
                      ? <div class="llama-light-text">{remoteError.value}</div>
                      : remoteModels.value.length
                        ? remoteModels.value.map((model) => (
                          <div class={['llama-model-card', remoteSelectedId.value === model.id ? 'active' : '']} onClick={() => { void loadRemoteDetail(model.id) }}>
                            <img class="llama-model-cover" src={model.avatar} />
                            <div>
                              <div class="llama-model-title">{model.name}</div>
                              <div class="llama-model-sub" title={model.id}>{model.id}</div>
                              <div class="llama-model-sub">{model.description || '暂无简介'}</div>
                            </div>
                            <div class="llama-model-tags">
                              <span>{`↓ ${model.downloads.toLocaleString()}`}</span>
                              <span>{`★ ${model.stars}`}</span>
                            </div>
                          </div>
                        ))
                        : <div class="llama-light-text">没有匹配模型，请换关键词。</div>}
              </div>
            </div>

            <div class="llama-model-pane">
              <div class="llama-pane-head"><div class="llama-light-text">{activeTab.value === 'local' ? '本地模型详情' : '在线模型详情'}</div></div>
              <div class="llama-detail">
                {activeTab.value === 'local'
                  ? (() => {
                    const cfg = opts.getConfig()
                    const selected = localModels.value.find((m) => m.id === localSelectedId.value)
                    if (!selected) return <div class="llama-light-text">请选择左侧模型。</div>
                    const currentMmproj = String(cfg.mmprojMap?.[selected.id] || '').trim()
                    return (
                      <>
                        <div class="llama-detail-head">
                          <img class="llama-detail-cover" src={opts.ggmlLogoDataUrl} />
                          <div><div class="llama-detail-name">{selected.name}</div><div class="llama-detail-id">{selected.id}</div></div>
                        </div>
                        <div class="llama-detail-desc">{`模型路径:\n${selected.modelPath}\n\nmmproj:\n${currentMmproj || '未设置'}`}</div>
                        <div class="llama-detail-actions">
                          {renderButton('选择 mmproj', {
                            variant: 'secondary',
                            disabled: loadingModel.value,
                            onClick: async () => { await opts.pickMmprojForModel(selected); refreshLocalModels() }
                          })}
                          {renderButton(selected.id === cfg.loadedModelId ? '重载模型' : '加载模型', {
                            variant: selected.id === cfg.loadedModelId ? 'secondary' : 'primary',
                            loading: loadingModel.value && loadingId.value === selected.id,
                            disabled: loadingModel.value && loadingId.value !== selected.id,
                            onClick: async () => {
                              const ok = await opts.loadLocalModel(selected)
                              if (ok) refreshLocalModels()
                            }
                          })}
                        </div>
                      </>
                    )
                  })()
                  : (() => {
                    if (!remoteDetail.value) return <div class="llama-light-text">请选择左侧在线模型。</div>
                    const item = remoteDetail.value
                    const desc = item.description || item.readme || '暂无描述'
                    return (
                      <>
                        <div class="llama-detail-head">
                          <img class="llama-detail-cover" src={item.avatar} />
                          <div>
                            <div class="llama-detail-name">{item.name}</div>
                            <div class="llama-detail-id">{item.id}</div>
                            <div class="llama-light-text">{`下载 ${item.downloads.toLocaleString()}  星标 ${item.stars}  更新 ${formatAgo(item.updatedAt)} 前`}</div>
                          </div>
                        </div>
                        {remoteDetailLoading.value ? <div class="llama-light-text">加载模型详情中...</div> : <div class="llama-detail-desc">{desc}</div>}
                        <div class="llama-detail-actions">
                          {renderButton('打开 ModelScope', { variant: 'secondary', onClick: () => window.open(`${opts.modelscopeBaseUrl}/${item.id}`, '_blank') })}
                          {renderButton('打开 Hugging Face', { variant: 'secondary', onClick: () => window.open(`https://huggingface.co/${item.id}`, '_blank') })}
                          {renderButton('复制下载命令', {
                            variant: 'primary',
                            onClick: async () => {
                              const cmd = `python -c "from modelscope import snapshot_download; snapshot_download('${item.id}')"`
                              try {
                                await navigator.clipboard.writeText(cmd)
                                context.notification.success('已复制下载命令。', 'llama.cpp')
                              } catch {
                                context.notification.warning(`复制失败，请手动复制：${cmd}`, 'llama.cpp')
                              }
                            }
                          })}
                        </div>
                      </>
                    )
                  })()}
              </div>
            </div>
          </div>
        </div>
      )
    }
  }))
}
