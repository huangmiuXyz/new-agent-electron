export interface BackButtonOptions {
  enabled: Ref<boolean> | ComputedRef<boolean>
  handler: () => boolean
}

// Global state to track registered handlers across components
const registeredHandlers: BackButtonOptions[] = []
let isGlobalListenerAdded = false
const lastBackPressTime = ref(0)
const EXIT_THRESHOLD = 2000 // 2 seconds

export function useBackButton(options?: BackButtonOptions) {
  const router = useRouter()
  const route = useRoute()

  const pushBlockState = () => {
    if (history.state && history.state.__backBlock) return
    history.pushState({ __backBlock: true }, '', location.href)
  }

  const handleBack = () => {
    // 1. Try registered handlers first (most recent/innermost first)
    for (let i = registeredHandlers.length - 1; i >= 0; i--) {
      const h = registeredHandlers[i]
      if (h.enabled.value) {
        if (h.handler()) {
          pushBlockState() // Reinstate block for next back press
          return
        }
      }
    }

    // 2. Global application level logic
    const path = route.path
    const pathSegments = path.split('/').filter(Boolean)

    // Case 1: Sub-pages/Detail pages (e.g., /mobile/chat/session, /mobile/settings/knowledge/xxx)
    if (pathSegments.length > 2) {
      router.back()
      // Push state again to keep blocking the NEXT back button if we are still in mobile mode
      pushBlockState()
      return
    }

    // Case 2: Root level tabs (/mobile/chat, /mobile/settings)
    const now = Date.now()
    if (now - lastBackPressTime.value < EXIT_THRESHOLD) {
      // Double press detected at root, allow actual exit
      window.close()
    } else {
      lastBackPressTime.value = now
      // @ts-ignore
      if (window.messageApi) {
        // @ts-ignore
        window.messageApi.info('再按一次退出应用')
      }
      pushBlockState()
    }
  }

  const onPopState = (event: PopStateEvent) => {
    // If the state was pushed by us to block, we handle it
    if (event.state && event.state.__backBlock) {
      handleBack()
    }
  }

  onMounted(() => {
    if (options) {
      registeredHandlers.push(options)
    }

    if (!isGlobalListenerAdded && window.innerWidth < 768) {
      isGlobalListenerAdded = true
      pushBlockState()
      window.addEventListener('popstate', onPopState)
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
