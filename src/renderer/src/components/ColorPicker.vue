<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

interface Props {
  modelValue?: string
  disabled?: boolean
  size?: 'md' | 'sm'
  placeholder?: string
  presetColors?: string[]
  showAlpha?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '#000000',
  disabled: false,
  size: 'md',
  placeholder: '选择颜色',
  presetColors: () => [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#6d9eeb', '#8e7cc3', '#c27ba0',
    '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#3b78cd', '#674ea7', '#a64d79',
    '#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#0b5394', '#351c75', '#741b47',
    '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#073763', '#063763', '#20124d', '#4c1130'
  ],
  showAlpha: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const colorInput = ref(props.modelValue || '#000000')
const showPicker = ref(false)
const pickerRef = ref<HTMLElement>()

// 颜色格式验证和转换
const isValidHexColor = (color: string): boolean => {
  const hexRegex = props.showAlpha 
    ? /^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{3})$/
    : /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  return hexRegex.test(color)
}

const normalizeHexColor = (color: string): string => {
  if (!isValidHexColor(color)) return props.modelValue || '#000000'
  
  // 扩展简写形式
  if (color.length === 4) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
  }
  
  if (props.showAlpha && color.length === 5) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3] + color[4] + color[4]
  }
  
  return color
}

// 计算当前显示的颜色
const currentColor = computed(() => {
  return normalizeHexColor(colorInput.value)
})

// 计算RGB值用于显示
const rgbValues = computed(() => {
  const hex = currentColor.value
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = props.showAlpha && hex.length > 7 
    ? parseInt(hex.slice(7, 9), 16) / 255 
    : 1
  
  return { r, g, b, a }
})

// 监听外部值变化
watch(() => props.modelValue, (newValue) => {
  if (newValue && newValue !== colorInput.value) {
    colorInput.value = newValue
  }
})

// 监听内部值变化
watch(colorInput, (newValue) => {
  if (isValidHexColor(newValue)) {
    const normalized = normalizeHexColor(newValue)
    emit('update:modelValue', normalized)
  }
})

// 选择预设颜色
const selectPresetColor = (color: string) => {
  colorInput.value = color
  showPicker.value = false
}

// 处理颜色输入
const handleColorInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  let value = target.value
  
  // 自动添加#前缀
  if (value && !value.startsWith('#')) {
    value = '#' + value
  }
  
  colorInput.value = value
}

// 处理原生颜色选择器
const handleNativeColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  colorInput.value = target.value
}

// 点击外部关闭选择器
const handleClickOutside = (event: MouseEvent) => {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    showPicker.value = false
  }
}

// 监听选择器显示状态
watch(showPicker, (newValue) => {
  if (newValue) {
    nextTick(() => {
      document.addEventListener('click', handleClickOutside)
    })
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="color-picker-wrapper" :class="`color-picker--${size}`" ref="pickerRef">
    <div class="color-input-container">
      <!-- 颜色预览 -->
      <div 
        class="color-preview" 
        :style="{ backgroundColor: currentColor }"
        @click="!disabled && (showPicker = !showPicker)"
      ></div>
      
      <!-- 颜色输入框 -->
      <input
        type="text"
        :value="colorInput"
        :placeholder="placeholder"
        :disabled="disabled"
        class="color-text-input"
        @input="handleColorInput"
      />
      
      <!-- 原生颜色选择器 -->
      <input
        type="color"
        :value="currentColor.slice(0, 7)"
        :disabled="disabled"
        class="color-native-input"
        @change="handleNativeColorChange"
      />
    </div>
    
    <!-- 颜色选择器面板 -->
    <Transition name="picker-fade">
      <div v-if="showPicker && !disabled" class="color-picker-panel">
        <!-- RGB值显示 -->
        <div class="color-info">
          <div class="color-hex">{{ currentColor }}</div>
          <div class="color-rgb">
            RGB({{ rgbValues.r }}, {{ rgbValues.g }}, {{ rgbValues.b }})
            <span v-if="showAlpha">, {{ Math.round(rgbValues.a * 255) }}</span>
          </div>
        </div>
        
        <!-- 预设颜色网格 -->
        <div class="preset-colors">
          <div
            v-for="color in presetColors"
            :key="color"
            class="preset-color"
            :style="{ backgroundColor: color }"
            :class="{ active: color === currentColor }"
            @click="selectPresetColor(color)"
            :title="color"
          ></div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.color-picker-wrapper {
  position: relative;
  width: 100%;
}

.color-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.color-preview {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}

.color-preview:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-picker--sm .color-preview {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.color-text-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border 0.2s, box-shadow 0.2s;
  color: var(--text-primary);
  background-color: #fff;
}

.color-picker--sm .color-text-input {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
}

.color-text-input:focus {
  border-color: var(--text-secondary);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.color-text-input:disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.color-native-input {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: none;
  padding: 0;
  flex-shrink: 0;
}

.color-picker--sm .color-native-input {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.color-native-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-native-input::-webkit-color-swatch {
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
}

.color-picker--sm .color-native-input::-webkit-color-swatch {
  border-radius: 4px;
}

.color-picker-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 1000;
  background: #fff;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 16px;
  min-width: 280px;
  max-width: 320px;
}

.color-info {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.color-hex {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.color-rgb {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.preset-colors {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}

.preset-color {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  transition: transform 0.2s, box-shadow 0.2s;
}

.preset-color:hover {
  transform: scale(1.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.preset-color.active {
  border: 2px solid #000;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

/* 过渡动画 */
.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>