<template>
  <div class="reasoning-block" :class="{ 'is-open': isReasoningExpanded }">
    <div class="reasoning-header" @click="toggleReasoning">
      <div class="reasoning-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
          <path
            d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z">
          </path>
        </svg>
        <span>思考过程</span>
      </div>
      <svg class="toggle-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256"
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

<style>
.reasoning-block {
  border: none;
  border-radius: 4px;
  background-color: transparent;
  overflow: hidden;
  margin-bottom: 2px;
}

.reasoning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  transition: opacity 0.2s;
  opacity: 0.7;
}

.reasoning-header:hover {
  opacity: 1;
}

.reasoning-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.toggle-icon {
  color: var(--text-sub);
  transition: transform 0.2s ease;
}

.reasoning-block.is-open .toggle-icon {
  transform: rotate(180deg);
}

.reasoning-body {
  padding: 2px 4px 4px 14px;
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
