<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  active: boolean
  level: number
  manualRecording: boolean
  continuousActive: boolean
}>()

const emit = defineEmits<{
  toggleManual: []
  toggleContinuous: []
}>()

const { FileMusic, Mic } = useIcon(['FileMusic', 'Mic'])
</script>

<template>
  <div v-if="props.visible || props.active" class="input-audio-controls">
    <div class="input-audio-status" aria-hidden="true">
      <span class="input-audio-dot" :class="{ active: props.manualRecording || props.continuousActive }"></span>
      <div class="input-audio-level" aria-hidden="true">
        <span :style="{ width: `${Math.min(100, Math.round(props.level * 500))}%` }"></span>
      </div>
    </div>
    <div class="input-audio-segment" role="group" aria-label="音频录入模式">
      <button
        type="button"
        class="input-audio-segment-button"
        :class="{ 'input-audio-active': props.manualRecording }"
        :aria-pressed="props.manualRecording"
        @click="emit('toggleManual')"
      >
        <Mic />
        <span>{{ props.manualRecording ? '结束录入' : '手动录入' }}</span>
      </button>
      <button
        type="button"
        class="input-audio-segment-button"
        :class="{ 'input-audio-active': props.continuousActive }"
        :aria-pressed="props.continuousActive"
        @click="emit('toggleContinuous')"
      >
        <FileMusic />
        <span>{{ props.continuousActive ? '停止连续' : '连续录入' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-audio-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 4px 5px 4px 8px;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-hover) 78%, var(--bg-input));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 70%, transparent);
}

.input-audio-status {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.input-audio-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-tertiary);
}

.input-audio-dot.active {
  background: var(--color-primary);
}

.input-audio-level {
  width: 52px;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-hover);
  flex-shrink: 0;
}

.input-audio-level span {
  display: block;
  height: 100%;
  min-width: 3px;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 0.08s linear;
}

.input-audio-segment {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-card) 86%, var(--bg-hover));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 72%, transparent);
}

.input-audio-segment-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 23px;
  min-width: 74px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  line-height: 1;
}

.input-audio-segment-button:hover {
  color: var(--text-primary);
}

.input-audio-segment-button:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.input-audio-segment-button :deep(.xicon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 0;
  vertical-align: middle;
}

.input-audio-segment-button :deep(svg) {
  display: block;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.input-audio-segment-button span {
  line-height: 1;
}

.input-audio-segment-button.input-audio-active {
  color: var(--color-primary);
  background: var(--bg-input);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 58%, transparent);
}

@media (max-width: 767px) {
  .input-audio-controls {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .input-audio-segment {
    justify-content: flex-end;
  }
}
</style>
