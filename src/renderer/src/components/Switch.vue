<script setup lang="ts">
const modelValue = defineModel<boolean>()

const toggle = () => {
  modelValue.value = !modelValue.value
}
</script>

<template>
  <div class="toggle-switch" :class="{ checked: modelValue }" @click="toggle">
  </div>
</template>

<style scoped>
.toggle-switch {
  width: 36px;
  height: 20px;
  background: #e9e9ea;
  border-radius: 20px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: left 0.2s;
}

.toggle-switch.checked {
  background: #34c759;
}

.toggle-switch.checked::after {
  left: 18px;
}
</style>
