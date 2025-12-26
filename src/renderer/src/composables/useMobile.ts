import { useRouter, useRoute } from 'vue-router'

export const useMobile = () => {
  const router = useRouter()
  const route = useRoute()

  const back = () => {
    // Mobile Router Mode
    if (window.innerWidth < 768) {
      if (route.path.split('/').length > 3) {
        // e.g. /mobile/settings/models
        router.back()
        return
      }
      // Top level back? Maybe nothing or minimize?
      // If we are at /mobile/chat or /mobile/settings, we are at root.
      return
    }
    // Desktop: No explicit state back needed as navigation is via AppNavBar switching or List selection.
    // If we wanted to "close" things, we might set currentView, but usually back() is for Mobile-like header behavior.
  }
  return {
    back
  }
}
