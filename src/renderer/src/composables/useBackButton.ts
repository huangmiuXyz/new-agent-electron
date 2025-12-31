import { App } from '@capacitor/app'

export interface BackButtonOptions {
  enabled: Ref<boolean> | ComputedRef<boolean>
  handler: () => boolean
}

const registeredHandlers: BackButtonOptions[] = []
let isGlobalListenerAdded = false
const lastBackPressTime = ref(0)
const EXIT_THRESHOLD = 2000

export function useBackButton(options?: BackButtonOptions) {
  const router = useRouter()
  const route = useRoute()

  const handleBack = () => {
    for (let i = registeredHandlers.length - 1; i >= 0; i--) {
      const h = registeredHandlers[i]
      if (h.enabled.value) {
        if (h.handler()) {
          return
        }
      }
    }

    const currentDepth = (route.meta.depth as number) || 0

    // 如果当前页面深度大于1，则返回上一页
    if (currentDepth > 1) {
      router.back()
      return
    }

    // 如果在深度为1的页面（如列表页），则执行退出逻辑
    const now = Date.now()
    if (now - lastBackPressTime.value < EXIT_THRESHOLD) {
      App.exitApp()
    } else {
      lastBackPressTime.value = now
      messageApi.info('再按一次退出应用')
    }
  }

  onMounted(() => {
    if (options) {
      registeredHandlers.push(options)
    }

    if (!isGlobalListenerAdded && window.innerWidth < 768) {
      isGlobalListenerAdded = true
      App.addListener('backButton', () => {
        handleBack()
      })
    }
  })

  onUnmounted(() => {
    if (options) {
      const index = registeredHandlers.indexOf(options)
      if (index > -1) {
        registeredHandlers.splice(index, 1)
      }
    }
  })
}
