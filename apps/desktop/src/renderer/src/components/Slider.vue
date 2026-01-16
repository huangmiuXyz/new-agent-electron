<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  min?: number
  max?: number
  step?: number
  unit?: string
  unlimited?: boolean
}

const modelValue = defineModel<number>({ required: true })

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  unlimited: false
})

const sliderValue = computed({
  get() {
    if (modelValue.value === undefined) return props.min
    if (props.unlimited && modelValue.value > props.max) {
      return props.max
    }
    return modelValue.value
  },
  set(val: number) {
    modelValue.value = val
  }
})

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.value === '') return

  const val = Number(target.value)

  if (!props.unlimited && val > props.max) {
    modelValue.value = props.max
  }
}

const handleBlur = (e: Event) => {
  const target = e.target as HTMLInputElement
  let val = Number(target.value)

  if (target.value === '' || isNaN(val)) {
    modelValue.value = props.min
    return
  }

  if (val < props.min) {
    modelValue.value = props.min
  } else if (!props.unlimited && val > props.max) {
    modelValue.value = props.max
  }
}
</script>

<template>
  <div class="slider-container" :class="{ 'is-overflow': unlimited && (modelValue || 0) > max }">
    <div class="range-wrapper">
      <input type="range" :min="min" :max="max" :step="step" v-model.number="sliderValue" class="slider-input" />
    </div>

    <div class="number-wrapper">
      <input type="number" :step="step" v-model.number="modelValue" @input="handleInput" @blur="handleBlur"
        class="number-input" />
      <span v-if="unit" class="unit">{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.slider-container {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.range-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.slider-input {
  width: 100%;
  accent-color: var(--accent-color);
  cursor: pointer;
  height: 6px;
  background: var(--border-color-light);
  border-radius: 3px;
  outline: none;
  position: relative;
  z-index: 1;
}

.is-overflow .slider-input {
  accent-color: var(--text-secondary);
}


.number-wrapper {
  display: flex;
  align-items: center;
  background-color: var(--bg-hover);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
  width: 60px;
}

.number-wrapper:focus-within {
  border-color: var(--accent-color);
  background: var(--bg-card);
}

.number-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  text-align: right;
  font-family: inherit;
  font-size: 14px;
  color: var(--text-primary);
  -moz-appearance: textfield;
}

.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit {
  margin-left: 4px;
  font-size: 14px;
  color: var(--text-secondary);
  user-select: none;
}

.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 50%;
  transition: transform 0.1s;
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider-input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border: none;
  border-radius: 50%;
  transition: transform 0.1s;
  cursor: pointer;
}

.slider-input::-moz-range-thumb:hover {
  transform: scale(1.2);
}
</style>
