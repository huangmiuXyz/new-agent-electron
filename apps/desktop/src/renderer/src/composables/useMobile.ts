import { useRouter, useRoute } from 'vue-router'
import { triggerBackNavigation } from './useBackButton'

export const useMobile = () => {
  const router = useRouter()
  const route = useRoute()

  const back = () => {
    if (window.innerWidth < 768) {
      triggerBackNavigation(router, route)
    }
  }

  return {
    back
  }
}
