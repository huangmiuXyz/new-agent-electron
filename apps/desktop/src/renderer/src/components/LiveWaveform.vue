<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  active: boolean
}>()

const startTime = ref(0)
const elapsed = ref('0:00')
let timer: ReturnType<typeof setInterval> | null = null

watch(() => props.active, (active) => {
  if (active) {
    startTime.value = Date.now()
    elapsed.value = '0:00'
    timer = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime.value) / 1000)
      const m = Math.floor(sec / 60)
      const s = sec % 60
      elapsed.value = `${m}:${s.toString().padStart(2, '0')}`
    }, 200)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const barHeights = Array.from({ length: 32 }, (_, i) => {
  const center = 16
  const dist = Math.abs(i - center) / center
  return Math.round((1 - dist * 0.45) * 70 + Math.random() * 30)
})
</script>

<template>
  <div v-if="active" class="live-waveform">
    <div class="live-indicator">
      <span class="live-dot"></span>
      <span class="live-label">语音生成中</span>
    </div>
    <div class="waveform-track" aria-hidden="true">
      <span
        v-for="(h, i) in barHeights"
        :key="i"
        class="wf-bar"
        :style="{
          height: h + '%',
          animationDelay: (i * 0.04) + 's',
        }"
      />
    </div>
    <span class="live-time">{{ elapsed }}</span>
  </div>
</template>

<style scoped>
.live-waveform {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 4px;
  margin-top: 6px;
  border-top: 1px solid var(--border-color-light);
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  animation: live-pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}

.live-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--accent-color);
  white-space: nowrap;
}

.waveform-track {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
}

.wf-bar {
  flex: 1;
  min-width: 2px;
  border-radius: 2px;
  background: var(--accent-color);
  opacity: 0.35;
  transform-origin: bottom;
  animation: wave-bar 1.4s ease-in-out infinite;
}

@keyframes wave-bar {
  0%, 100% {
    opacity: 0.25;
    transform: scaleY(0.5);
  }
  50% {
    opacity: 0.85;
    transform: scaleY(1);
  }
}

.live-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  flex-shrink: 0;
  min-width: 3em;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', monospace;
}
</style>
