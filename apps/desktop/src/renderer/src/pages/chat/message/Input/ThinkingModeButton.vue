<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'

type ThinkingDepth = 'low' | 'medium' | 'high' | 'max'

const props = defineProps<{
  providerType?: string
}>()

const { thinkingMode, updateThinkingMode } = useSettingsStore()
const showPopover = ref(false)
const popoverRef = ref<HTMLElement>()
const Bulb = useIcon('Bulb')

const depthOptions = computed<{ label: string; value: ThinkingDepth; desc: string }[]>(() => {
  const pt = props.providerType
  if (pt === 'deepseek') {
    return [
      { label: '高', value: 'high', desc: '标准思考' },
      { label: '最大', value: 'max', desc: '深度思考' }
    ]
  }
  if (pt === 'xai') {
    return [
      { label: '低', value: 'low', desc: '轻量思考' },
      { label: '高', value: 'high', desc: '深度思考' }
    ]
  }
  return [
    { label: '低', value: 'low', desc: '轻量思考' },
    { label: '中', value: 'medium', desc: '均衡思考' },
    { label: '高', value: 'high', desc: '深度思考' }
  ]
})

const toggle = () => {
  if (thinkingMode) {
    updateThinkingMode(null)
  } else {
    showPopover.value = !showPopover.value
  }
}

const selectDepth = (depth: ThinkingDepth | null) => {
  updateThinkingMode(depth)
  showPopover.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (showPopover.value && popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
    showPopover.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="thinking-popover" ref="popoverRef">
    <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
      @click.stop="toggle"
      :title="thinkingMode ? `思考模式: ${thinkingMode}` : '思考模式'">
      <Bulb />
    </Button>
    <div v-if="showPopover" class="thinking-panel">
      <div class="thinking-panel-title">思考深度</div>
      <div class="thinking-panel-options">
        <button v-for="opt in depthOptions" :key="opt.value" class="thinking-depth-item"
          :class="{ active: thinkingMode === opt.value }"
          @click.stop="selectDepth(opt.value)">
          <span class="thinking-depth-label">{{ opt.label }}</span>
          <span class="thinking-depth-desc">{{ opt.desc }}</span>
        </button>
        <button v-if="thinkingMode" class="thinking-depth-item thinking-depth-off"
          @click.stop="selectDepth(null)">
          <span class="thinking-depth-label">关闭</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.thinking-popover {
  position: relative;
  display: inline-flex;
}

.thinking-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  min-width: 140px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-card) 96%, white);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  z-index: 20;
}

.thinking-panel-title {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 4px 8px 6px;
  font-weight: 500;
}

.thinking-panel-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thinking-depth-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background 0.12s ease;
}

.thinking-depth-item:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.thinking-depth-item.active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
}

.thinking-depth-label {
  font-weight: 500;
}

.thinking-depth-desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

.thinking-depth-item.active .thinking-depth-desc {
  color: var(--color-primary);
  opacity: 0.7;
}

.thinking-depth-off {
  color: var(--text-secondary);
}

.thinking-depth-off:hover {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
}
</style>
