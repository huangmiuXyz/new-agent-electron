<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  size?: 'md' | 'sm'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const presetOptions = [
  { label: '1K | 1:1 | 1024x1024', value: '1024x1024' },
  { label: '2K | 1:1 | 2048x2048', value: '2048x2048' },
  { label: '2K | 4:3 | 2304x1728', value: '2304x1728' },
  { label: '2K | 3:4 | 1728x2304', value: '1728x2304' },
  { label: '2K | 16:9 | 2848x1600', value: '2848x1600' },
  { label: '2K | 9:16 | 1600x2848', value: '1600x2848' },
  { label: '2K | 3:2 | 2496x1664', value: '2496x1664' },
  { label: '2K | 2:3 | 1664x2496', value: '1664x2496' },
  { label: '2K | 21:9 | 3136x1344', value: '3136x1344' },
  { label: '3K | 1:1 | 3072x3072', value: '3072x3072' },
  { label: '3K | 4:3 | 3456x2592', value: '3456x2592' },
  { label: '3K | 3:4 | 2592x3456', value: '2592x3456' },
  { label: '3K | 16:9 | 4096x2304', value: '4096x2304' },
  { label: '3K | 9:16 | 2304x4096', value: '2304x4096' },
  { label: '3K | 2:3 | 2496x3744', value: '2496x3744' },
  { label: '3K | 3:2 | 3744x2496', value: '3744x2496' },
  { label: '3K | 21:9 | 4704x2016', value: '4704x2016' },
  { label: '4K | 1:1 | 4096x4096', value: '4096x4096' },
  { label: '512x512', value: '512x512' }
]

const isCustom = ref(false)
const width = ref(1024)
const height = ref(1024)

// Initialize based on modelValue
const init = () => {
  const isPreset = presetOptions.some(opt => opt.value === props.modelValue)
  if (isPreset) {
    isCustom.value = false
    const [w, h] = props.modelValue.split('x').map(Number)
    width.value = w || 1024
    height.value = h || 1024
  } else {
    isCustom.value = true
    const [w, h] = props.modelValue.split('x').map(Number)
    width.value = w || 1024
    height.value = h || 1024
  }
}

init()

const selectedPreset = computed({
  get: () => isCustom.value ? 'custom' : props.modelValue,
  set: (val) => {
    if (val === 'custom') {
      isCustom.value = true
      emitSize()
    } else {
      isCustom.value = false
      emit('update:modelValue', val as string)
    }
  }
})

const options = computed(() => [
  ...presetOptions,
  { label: '自定义...', value: 'custom' }
])

const emitSize = () => {
  const w = Number(width.value) || 1024
  const h = Number(height.value) || 1024
  emit('update:modelValue', `${w}x${h}`)
}

watch([width, height], () => {
  if (isCustom.value) {
    emitSize()
  }
})

// Update internal width/height when modelValue changes externally (if it's custom)
watch(() => props.modelValue, (newVal) => {
  const isPreset = presetOptions.some(opt => opt.value === newVal)
  if (newVal) {
    const [w, h] = newVal.split('x').map(Number)
    if (w && h) {
      width.value = w
      height.value = h
    }
  }
  isCustom.value = !isPreset
})
</script>

<template>
  <div class="image-size-selector">
    <Select v-model="selectedPreset" :options="options" :size="size" />
    <div v-if="isCustom" class="custom-inputs">
      <div class="input-group">
        <Input v-model="width" type="number" :size="size" placeholder="宽" />
        <span class="separator">×</span>
        <Input v-model="height" type="number" :size="size" placeholder="高" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-size-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.custom-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.separator {
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 0 2px;
}

.input-group :deep(.input-wrapper) {
  flex: 1;
}

.input-group :deep(.form-input) {
  text-align: center;
}
</style>
