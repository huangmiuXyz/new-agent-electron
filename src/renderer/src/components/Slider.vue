<script setup lang="ts">
interface Props {
  min?: number
  max?: number
  step?: number
  unit?: string
  unlimited?: boolean // 新增：是否开启无上限模式
}

// 定义 v-model
const modelValue = defineModel<number>({ required: true })

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  unlimited: false
})

// 处理手动输入时的逻辑
const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.value === '') return

  const val = Number(target.value)

  // 仅在 非无上限模式 下，实时限制最大值
  if (!props.unlimited && val > props.max) {
    modelValue.value = props.max
  }
  // 注意：此处不处理最小值，允许用户删除数字重新输入（例如从 10 改为 5，中间可能出现空或0）
}

// 失焦时进行最终校验
const handleBlur = (e: Event) => {
  const target = e.target as HTMLInputElement
  const val = Number(target.value)

  // 1. 处理空值或非数字 -> 重置为最小值
  if (target.value === '' || isNaN(val)) {
    modelValue.value = props.min
    return
  }

  // 2. 处理小于最小值
  if (val < props.min) {
    modelValue.value = props.min
    return
  }

  // 3. 处理最大值 (仅在有限制模式下)
  if (!props.unlimited && val > props.max) {
    modelValue.value = props.max
  }
}
</script>

<template>
  <div class="slider-container" :class="{ 'is-unlimited': unlimited }">
    <!-- 滑块区域 -->
    <div class="range-wrapper">
      <input type="range" :min="min" :max="max" :step="step" v-model.number="modelValue" class="slider-input" />
      <!-- 装饰：无上限模式下，当数值超过 max 时显示一个视觉提示 -->
      <div v-if="unlimited && (modelValue || 0) > max" class="overflow-indicator" title="当前数值已超出滑块范围"></div>
    </div>

    <!-- 输入框区域 -->
    <div class="number-wrapper">
      <input type="number" :min="min" :step="step" v-model.number="modelValue" @input="handleInput" @blur="handleBlur"
        class="number-input" :placeholder="String(min)" />
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
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  /* 为了定位溢出指示器 */
}

/* 基础滑块样式 */
.slider-input {
  width: 100%;
  accent-color: #000;
  cursor: pointer;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
  /* 移除默认外观以统一样式（可选） */
}

/* 当处于无上限模式且数值溢出时，改变滑块轨道的颜色或样式提示 */
.is-unlimited .slider-input {
  accent-color: #4b5563;
  /* 稍微变色提示当前并不是终点 */
}

/* 输入框容器 */
.number-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: #f3f4f6;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
  min-width: 80px;
  /* 稍微加宽以容纳大数字 */
  justify-content: flex-end;
}

.number-wrapper:focus-within {
  border-color: #000;
  background-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.number-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  text-align: right;
  font-family: inherit;
  font-size: 14px;
  color: #374151;
  -moz-appearance: textfield;
}

.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit {
  font-size: 14px;
  color: #9ca3af;
  user-select: none;
  flex-shrink: 0;
}

/* 溢出指示器（可选）：当数值超过滑块max时，在滑块右侧显示一个小圆点或线条 */
.overflow-indicator {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 4px;
  background-color: #ef4444;
  /* 红色提示溢出 */
  border-radius: 50%;
  pointer-events: none;
}

/* 浏览器兼容性样式 */
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #000;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider-input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #000;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}
</style>