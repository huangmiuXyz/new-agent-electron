import { App } from '@capacitor/app'
import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

export interface BackButtonOptions {
  enabled: Ref<boolean> | ComputedRef<boolean>
  handler: () => boolean
}

const registeredHandlers: BackButtonOptions[] = []
let isGlobalListenerAdded = false
const lastBackPressTime = ref(0)
const EXIT_THRESHOLD = 2000

export function runRegisteredBackHandlers() {
  for (let i = registeredHandlers.length - 1; i >= 0; i--) {
    const h = registeredHandlers[i]
    if (h.enabled.value && h.handler()) {
      return true
    }
  }

  return false
}

export function handleDefaultBackNavigation(
  router: Router,
  route: RouteLocationNormalizedLoaded
) {
  const currentDepth = (route.meta.depth as number) || 0

  if (currentDepth > 1) {
    router.back()
    return true
  }

  const now = Date.now()
  if (now - lastBackPressTime.value < EXIT_THRESHOLD) {
    App.exitApp()
  } else {
    lastBackPressTime.value = now
    messageApi.info('再按一次退出应用')
  }

  return true
}

export function triggerBackNavigation(
  router: Router,
  route: RouteLocationNormalizedLoaded
) {
  if (runRegisteredBackHandlers()) {
    return true
  }

  return handleDefaultBackNavigation(router, route)
}

export function useBackButton(options?: BackButtonOptions) {
  const router = useRouter()
  const route = useRoute()

  const handleBack = () => {
    triggerBackNavigation(router, route)
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
