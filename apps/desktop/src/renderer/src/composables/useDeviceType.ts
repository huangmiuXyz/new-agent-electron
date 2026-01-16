import { useWindowSize } from '@vueuse/core'

const { width } = useWindowSize({ initialWidth: window.innerWidth })

export const isMobile = computed(() => width.value < 768)
