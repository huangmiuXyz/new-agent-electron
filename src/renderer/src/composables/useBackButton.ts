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

  const pushBlockState = () => {
    if (window.innerWidth >= 768) return
    if (history.state && history.state.__backBlock) {
      return
    }

    history.pushState({ __backBlock: true }, '', location.href)
  }

  const handleBack = () => {
    for (let i = registeredHandlers.length - 1; i >= 0; i--) {
      const h = registeredHandlers[i]
      if (h.enabled.value) {
        if (h.handler()) {
          pushBlockState()
          return
        }
      }
    }

    const pathSegments = route.path.split('/').filter(Boolean)

    if (pathSegments.length > 2) {
      router.back()
      return
    }

    const now = Date.now()
    if (now - lastBackPressTime.value < EXIT_THRESHOLD) {
      window.close()
    } else {
      lastBackPressTime.value = now
      messageApi.info('再按一次退出应用')
      pushBlockState()
    }
  }

  const onPopState = (event: PopStateEvent) => {
    if (!event.state || !event.state.__backBlock) {
      handleBack()
    }
  }
  if (!options) {
    watch(
      () => route.fullPath,
      () => {
        if (window.innerWidth < 768) {
          setTimeout(pushBlockState, 200)
        }
      },
      { immediate: true }
    )
  }

  onMounted(() => {
    if (options) {
      registeredHandlers.push(options)
    }

    if (!isGlobalListenerAdded && window.innerWidth < 768) {
      isGlobalListenerAdded = true
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
