import { PluginContext } from '../types'

export function createConfigIcon(context: PluginContext, ConfigForm: any) {
  const { defineComponent, ref, onMounted, onUnmounted } = context.vue

  return defineComponent({
    name: 'ConfigIcon',
    setup() {
      const showTooltip = ref(false)

      const toggleTooltip = (e: MouseEvent) => {
        e.stopPropagation()
        showTooltip.value = !showTooltip.value
      }

      const closeTooltip = () => {
        showTooltip.value = false
      }

      onMounted(() => {
        window.addEventListener('click', closeTooltip)
      })

      onUnmounted(() => {
        window.removeEventListener('click', closeTooltip)
      })

      return () => (
        <div class="plugin-icon-container" onClick={toggleTooltip}>
          <style>{`
            .plugin-icon-container { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; cursor: pointer; }
            .plugin-tooltip {
              position: absolute;
              bottom: 100%;
              left: 0;
              margin-bottom: 10px;
              visibility: hidden;
              opacity: 0;
              transition: opacity 0.15s ease, visibility 0.15s;
              z-index: 10000;
            }
            .plugin-tooltip.is-show {
              visibility: visible;
              opacity: 1;
            }
            .plugin-tooltip-content {
              background: #ffffff; color: #333333; padding: 12px 16px; border-radius: 8px;
              font-size: 13px;
              box-shadow: 0 4px 16px rgba(0,0,0,0.15);
              border: 1px solid #e0e0e0;
              min-width: 320px;
            }
            html.dark-mode .plugin-tooltip-content { background: #2d2d2d; color: #ffffff; border-color: #444444; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }

            .plugin-tooltip-content :deep(.form-item) {
              margin-bottom: 8px;
              margin-top: 0;
            }
            .plugin-tooltip-content :deep(.form-item-label) {
              width: 80px;
              margin-bottom: 0;
              flex-shrink: 0;
            }
            .plugin-tooltip-content :deep(.form-item) {
              display: flex;
              align-items: center;
            }
            .plugin-tooltip-content :deep(.form-item-content) {
              flex: 1;
            }
          `}</style>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M21 16.5C21 16.88 20.79 17.21 20.47 17.38L12.57 21.82C12.41 21.94 12.21 22 12 22C11.79 22 11.59 21.94 11.43 21.82L3.53 17.38C3.21 17.21 3 16.88 3 16.5V7.5C3 7.12 3.21 6.79 3.53 6.62L11.43 2.18C11.59 2.06 11.79 2 12 2C12.21 2 12.41 2.06 12.57 2.18L20.47 6.62C20.79 6.79 21 7.12 21 7.5V16.5Z" />
          </svg>

          <div
            class={['plugin-tooltip', showTooltip.value && 'is-show']}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div class="plugin-tooltip-content">
              <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>ModelScope 绘图配置</div>
              <ConfigForm />
            </div>
          </div>
        </div>
      )
    }
  })
}
