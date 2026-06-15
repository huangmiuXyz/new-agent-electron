<script setup lang="ts">
const props = withDefaults(defineProps<{
  loading?: boolean
  size?: 'md' | 'sm'
}>(), {
  size: 'md'
})

const modelValue = defineModel<boolean>()

const toggle = () => {
  if (props.loading) return
  modelValue.value = !modelValue.value
}
</script>

<template>
  <div class="toggle-switch" :class="[size, { checked: modelValue, loading: props.loading }]" @click="toggle">
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
  background: rgba(var(--text-rgb), 0.2);
  border-radius: 100px;
  position: relative;
  cursor: pointer;
  transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.toggle-switch.sm {
  width: 28px;
  height: 16px;
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
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18), 0 1px 1px rgba(0, 0, 0, 0.1);
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  /* 为了居中 loading 图标 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-switch.sm .toggle-knob {
  width: 12px;
  height: 12px;
}

.toggle-switch.checked {
  background: var(--color-success);
}

.toggle-switch.checked .toggle-knob {
  left: 18px;
}

.toggle-switch.sm.checked .toggle-knob {
  left: 14px;
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
