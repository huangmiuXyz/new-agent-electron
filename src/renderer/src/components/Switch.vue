<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
}>()

const modelValue = defineModel<boolean>()

const toggle = () => {
  if (props.loading) return
  modelValue.value = !modelValue.value
}
</script>

<template>
  <div class="toggle-switch" :class="{ checked: modelValue, loading: props.loading }" @click="toggle">
    <div class="toggle-knob">
      <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4"></circle>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.toggle-switch {
  width: 36px;
  height: 20px;
  background: var(--border-color-medium);
  border-radius: 20px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.toggle-switch.loading {
  cursor: not-allowed;
  opacity: 0.7;
}

.toggle-knob {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: left 0.2s;

  /* 为了居中 loading 图标 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-switch.checked {
  background: var(--color-success);
}

.toggle-switch.checked .toggle-knob {
  left: 18px;
}

.spinner {
  width: 10px;
  height: 10px;
  animation: spin 1s linear infinite;
  color: var(--text-secondary);
}

.toggle-switch.checked .spinner {
  color: var(--color-success);
}

.spinner circle {
  opacity: 0.25;
}

.spinner circle {
  stroke-dasharray: 15;
  stroke-dashoffset: 10;
  stroke-linecap: round;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>