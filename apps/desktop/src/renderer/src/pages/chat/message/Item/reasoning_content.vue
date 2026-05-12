<template>
  <div class="reasoning-block" :class="{ 'is-open': isReasoningExpanded }">
    <div class="reasoning-header" @click="toggleReasoning">
      <div class="reasoning-label">
        <span class="reasoning-mark" aria-hidden="true">
          <Bulb class="reasoning-bulb" />
        </span>
        <span class="reasoning-text">思考过程</span>
      </div>
      <svg class="reasoning-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256"
        fill="currentColor">
        <path
          d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z">
        </path>
      </svg>
    </div>
    <div class="reasoning-body" v-show="isReasoningExpanded" @touchstart="handleReasoningTouchStart"
      @touchmove="handleReasoningTouchMove" @touchend="handleReasoningTouchEnd" @touchcancel="handleReasoningTouchEnd">
      {{ reasoning_content }}
    </div>
  </div>
</template>

<script lang="ts" setup>
const { display } = storeToRefs(useSettingsStore())
const Bulb = useIcon('Bulb')

defineProps<{ reasoning_content: string }>()

const isReasoningExpanded = ref(display.value.expandThoughtByDefault)
const lastTouchY = ref<number | null>(null)

const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

const getMessageScrollContainer = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return null
  return el.closest('.message-list-wrapper')?.querySelector('.auto-scroll-container') as HTMLElement | null
}

const handleReasoningTouchStart = (event: TouchEvent) => {
  if (!isMobile.value || event.touches.length === 0) return
  lastTouchY.value = event.touches[0].clientY
}

const handleReasoningTouchMove = (event: TouchEvent) => {
  if (!isMobile.value || event.touches.length === 0) return

  const container = getMessageScrollContainer(event.currentTarget)
  if (!container || lastTouchY.value === null) return

  const currentY = event.touches[0].clientY
  const deltaY = lastTouchY.value - currentY
  if (deltaY === 0) return

  container.scrollTop += deltaY
  lastTouchY.value = currentY
  event.preventDefault()
}

const handleReasoningTouchEnd = () => {
  lastTouchY.value = null
}
</script>

<style scoped>
.reasoning-block {
  width: 100%;
  max-width: 100%;
  margin: 2px 0 6px;
}

.reasoning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 20px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  transition: background-color 0.2s;
}

.reasoning-header:hover {
  background-color: var(--bg-hover);
}

.reasoning-label {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.reasoning-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reasoning-mark {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex: none;
  opacity: 0.8;
}

.reasoning-bulb {
  width: 12px;
  height: 12px;
}

.reasoning-toggle-icon {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.reasoning-block.is-open .reasoning-toggle-icon {
  transform: rotate(180deg);
}

.reasoning-body {
  margin: 2px 0 2px 6px;
  padding: 4px 6px 4px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  background-color: transparent;
  border-top: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  border-left: 2px solid var(--border-color-light);
  margin-left: 4px;
}

@media (max-width: 767px) {
  .reasoning-body {
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
