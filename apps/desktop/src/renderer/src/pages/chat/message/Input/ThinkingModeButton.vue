<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import {
  getThinkingDepthOptions,
  isMiniMaxM3Provider,
  type ThinkingDepth
} from '@renderer/services/chatService/thinkingMode'
import type { MenuItem } from '@renderer/composables/useContextMenu'

const props = defineProps<{
  providerType?: string
  providerId?: string
  modelId?: string
}>()

const settingsStore = useSettingsStore()
const { thinkingMode } = storeToRefs(settingsStore)
const { updateThinkingMode } = settingsStore
const { showContextMenu } = useContextMenu()
const Bulb = useIcon('Bulb')
const Check = useIcon('Check')

const isMiniMaxM3 = computed(() =>
  isMiniMaxM3Provider(props.providerType, props.providerId, props.modelId)
)

const thinkingLabel = computed(() => {
  if (!thinkingMode.value) return '思考模式'
  if (isMiniMaxM3.value && thinkingMode.value === 'adaptive') return '思考模式: 自适应'
  return `思考模式: ${thinkingMode.value}`
})

const depthOptions = computed(() =>
  getThinkingDepthOptions({
    providerType: props.providerType,
    providerId: props.providerId,
    modelId: props.modelId
  })
)

const handleClick = (event: MouseEvent) => {
  const items: MenuItem[] = depthOptions.value.map(opt => ({
    label: opt.label,
    icon: thinkingMode.value === opt.value ? Check : Bulb,
    onClick: () => updateThinkingMode(opt.value)
  }))

  if (thinkingMode.value) {
    items.push(
      { type: 'divider' },
      {
        label: '关闭思考',
        danger: true,
        onClick: () => updateThinkingMode(null)
      }
    )
  }

  showContextMenu(event, items)
}
</script>

<template>
  <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
    @click="handleClick" :title="thinkingLabel">
    <Bulb />
  </Button>
</template>

<style scoped>
.thinking-active {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
