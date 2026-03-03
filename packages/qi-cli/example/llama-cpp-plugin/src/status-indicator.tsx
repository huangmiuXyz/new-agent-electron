import {
  LlamaModelConfig,
  LlamaPluginConfig,
  PluginContext,
} from './types'

interface CreateServiceStatusRenderOptions {
  context: PluginContext
  tooltip: string
  running: boolean
  runtimeConfig: LlamaPluginConfig
  isStatusPanelOpen: boolean
  isLoadingModel: boolean
  loadingModelId: string
  ggmlLogoDataUrl: string
  onPanelOpenChange: (open: boolean) => void
  onPanelOpened: () => void
  onPanelClosed: () => void
  onStop: () => Promise<void>
  onReload: (model: LlamaModelConfig) => Promise<void>
  onCancelLoad: () => Promise<void>
}

export const createServiceStatusRender = (
  options: CreateServiceStatusRenderOptions
): unknown => {
  const {
    context,
    tooltip,
    running,
    runtimeConfig,
    isStatusPanelOpen,
    isLoadingModel,
    loadingModelId,
    ggmlLogoDataUrl,
    onPanelOpenChange,
    onPanelOpened,
    onPanelClosed,
    onStop,
    onReload,
    onCancelLoad,
  } = options

  return context.vue.markRaw(
    context.vue.defineComponent({
      setup() {
        const isOpen = context.vue.ref(isStatusPanelOpen)
        const wrapRef = context.vue.ref<HTMLElement | null>(null)
        const loadedModelId = runtimeConfig.loadedModelId
        const loadedModelName = runtimeConfig.models.find((m) => m.id === loadedModelId)?.name || 'None'
        const isLoaded = running && Boolean(loadedModelId)
        const loadingModelName = runtimeConfig.models.find((m) => m.id === loadingModelId)?.name || loadingModelId || 'Unknown'

        const closePanel = () => {
          if (!isOpen.value) return
          isOpen.value = false
          onPanelOpenChange(false)
          onPanelClosed()
        }

        const onOutsidePointer = (event: Event) => {
          if (!isOpen.value) return
          const targetEl = event.target as HTMLElement | null
          if (targetEl?.closest?.('.llama-status-wrap')) return

          const path = (event as Event & { composedPath?: () => EventTarget[] }).composedPath?.() || []
          if (path.length > 0) {
            const clickedInside = path.some((node) => {
              const el = node as HTMLElement
              return Boolean(el?.classList?.contains?.('llama-status-wrap'))
            })
            if (!clickedInside) closePanel()
            return
          }
          closePanel()
        }

        const onKeydown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            closePanel()
          }
        }

        context.vue.onMounted(() => {
          window.addEventListener('pointerdown', onOutsidePointer, true)
          window.addEventListener('click', onOutsidePointer, true)
          document.addEventListener('keydown', onKeydown)
        })

        context.vue.onUnmounted(() => {
          window.removeEventListener('pointerdown', onOutsidePointer, true)
          window.removeEventListener('click', onOutsidePointer, true)
          document.removeEventListener('keydown', onKeydown)
        })

        const toggleOpen = async (e: MouseEvent) => {
          e.stopPropagation()
          isOpen.value = !isOpen.value
          onPanelOpenChange(isOpen.value)
          if (isOpen.value) {
            onPanelOpened()
          } else {
            onPanelClosed()
          }
        }

        const handleStop = async (e: MouseEvent) => {
          e.stopPropagation()
          await onStop()
        }

        const handleReload = async (e: MouseEvent, model: LlamaModelConfig) => {
          e.stopPropagation()
          await onReload(model)
        }

        const handleCancelLoading = async (e: MouseEvent) => {
          e.stopPropagation()
          await onCancelLoad()
        }

        return () => (
          <div
            class="llama-status-wrap"
            ref={wrapRef}
            onClick={toggleOpen}
            title={tooltip}
          >
            <style>{`
              .llama-status-wrap {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                cursor: pointer;
              }
              .llama-status-wrap:hover {
                background: var(--bg-hover);
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
            `}</style>
            <div style="position:relative;display:flex;align-items:center;justify-content:center;width:16px;height:16px;">
              <span style="display:inline-flex;width:16px;height:16px;">
                <img
                  src={ggmlLogoDataUrl}
                  alt="GGML"
                  style={`width:16px;height:16px;opacity:${isLoaded ? '1' : '0.85'};filter:${isLoaded ? 'none' : 'grayscale(1)'};`}
                />
              </span>
              <span
                style={`position:absolute;right:-2px;bottom:-2px;width:6px;height:6px;border-radius:50%;background:${isLoaded ? '#16a34a' : '#6b7280'};border:1px solid var(--bg-card);`}
              />
            </div>
            <div
              class={['llama-status-tooltip', isOpen.value ? 'open' : '']}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <div class="llama-status-title">llama.cpp Service</div>
              <div class="llama-status-sub">Status: {running ? 'Running' : 'Stopped'}</div>
              {isLoadingModel ? <div class="llama-status-sub">Loading: {loadingModelName}</div> : null}
              <div class="llama-status-sub">Loaded: {loadedModelName}</div>
              <div class="llama-status-actions">
                {running && Boolean(loadedModelId) ? (
                  <button type="button" class="llama-status-btn" onClick={handleStop}>Stop</button>
                ) : null}
                {isLoadingModel ? (
                  <button type="button" class="llama-status-btn" onClick={handleCancelLoading}>Cancel Load</button>
                ) : null}
              </div>
              <div class="llama-status-title" style="margin-bottom:4px;">Switch / Reload</div>
              <div class="llama-status-models">
                {runtimeConfig.models.length
                  ? runtimeConfig.models.map((m) => (
                      <button
                        type="button"
                        class={['llama-status-model-row', m.id === loadedModelId ? 'active' : '']}
                        onClick={(e: MouseEvent) => handleReload(e, m)}
                      >
                        {m.name}
                      </button>
                    ))
                  : <div class="llama-status-sub" style="margin:0;">No scanned models.</div>}
              </div>
            </div>
          </div>
        )
      }
    })
  )
}
