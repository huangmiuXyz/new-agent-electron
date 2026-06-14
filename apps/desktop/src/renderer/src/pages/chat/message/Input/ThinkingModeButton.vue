<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import {
  getThinkingDepthOptions,
  isMiniMaxM3Provider,
  type ThinkingDepth
} from '@renderer/services/chatService/thinkingMode'

const props = defineProps<{
  providerType?: string
  providerId?: string
  modelId?: string
}>()

const settingsStore = useSettingsStore()
const { thinkingMode } = storeToRefs(settingsStore)
const { updateThinkingMode } = settingsStore
const showPopover = ref(false)
const popoverRef = ref<HTMLElement>()
const Bulb = useIcon('Bulb')

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

const toggle = () => {
  if (thinkingMode.value) {
    updateThinkingMode(null)
  } else if (isMiniMaxM3.value) {
    updateThinkingMode('adaptive')
    showPopover.value = false
  } else {
    showPopover.value = !showPopover.value
  }
}

const selectDepth = (depth: ThinkingDepth | null) => {
  updateThinkingMode(depth)
  showPopover.value = false
}

const closePopover = () => {
  showPopover.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (!isMobile.value && showPopover.value && popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
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
      :title="thinkingLabel">
      <Bulb />
    </Button>

    <template v-if="!isMobile">
      <div v-if="showPopover && !isMiniMaxM3" class="thinking-panel">
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
    </template>
  </div>

  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="isMobile && showPopover && !isMiniMaxM3" class="thinking-drawer-overlay" @click.self="closePopover">
        <div class="thinking-drawer-container">
          <div class="thinking-drawer-header">
            <div class="thinking-drawer-handle"></div>
            <div class="thinking-drawer-title">思考深度</div>
          </div>
          <div class="thinking-drawer-body">
            <button v-for="opt in depthOptions" :key="opt.value" class="thinking-drawer-item"
              :class="{ active: thinkingMode === opt.value }"
              @click="selectDepth(opt.value)">
              <span class="thinking-drawer-item-label">{{ opt.label }}</span>
              <span class="thinking-drawer-item-desc">{{ opt.desc }}</span>
            </button>
            <button v-if="thinkingMode" class="thinking-drawer-item thinking-drawer-off"
              @click="selectDepth(null)">
              <span class="thinking-drawer-item-label">关闭</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

.thinking-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.thinking-drawer-container {
  width: 100%;
  max-width: 100%;
  background: var(--bg-card);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  padding-bottom: max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px));
}

.thinking-drawer-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.thinking-drawer-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color-medium);
  margin-bottom: 8px;
}

.thinking-drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.thinking-drawer-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thinking-drawer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 15px;
  color: var(--text-primary);
  transition: background 0.12s ease;
}

.thinking-drawer-item:active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.thinking-drawer-item.active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
}

.thinking-drawer-item-label {
  font-weight: 500;
}

.thinking-drawer-item-desc {
  font-size: 13px;
  color: var(--text-tertiary);
}

.thinking-drawer-item.active .thinking-drawer-item-desc {
  color: var(--color-primary);
  opacity: 0.7;
}

.thinking-drawer-off {
  color: var(--text-secondary);
}

.thinking-drawer-off:active {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .thinking-drawer-container,
.drawer-leave-active .thinking-drawer-container {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-enter-from .thinking-drawer-container {
  transform: translateY(100%) scale(0.95);
}

.drawer-leave-to .thinking-drawer-container {
  transform: translateY(100%) scale(0.95);
}
</style>
