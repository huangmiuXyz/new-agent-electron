import { useWindowSize } from '@vueuse/core'

const { width } = useWindowSize()
export const isMobile = computed(() => width.value < 768)
