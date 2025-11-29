<script setup lang="ts">
interface Props {
  min?: number
  max?: number
  step?: number
  unit?: string
}

const modelValue = defineModel<number>()

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: ''
})
</script>

<template>
  <div class="slider-wrapper">
    <input type="range" :min="min" :max="max" :step="step" v-model="modelValue" class="slider-input" />
  </div>
</template>

<style scoped>
.slider-wrapper {
  width: 100%;
}

.slider-input {
  width: 100%;
  accent-color: #000;
  cursor: pointer;
}

.slider-input::-webkit-slider-thumb {
  cursor: pointer;
}

.slider-input::-moz-range-thumb {
  cursor: pointer;
}
</style>
