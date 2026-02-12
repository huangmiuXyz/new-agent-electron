<template>
  <div class="form-item">
    <div v-if="label" class="form-item-label">
      {{ label }}
      <span v-if="required" class="required">*</span>
    </div>
    <div class="form-item-content">
      <slot />
    </div>
    <div v-if="hint" class="form-item-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  required?: boolean
  hint?: string
}>()
</script>

<style scoped>
.form-item {
  width: 100%;
}

.form-item-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.required {
  color: #ff4757;
}

.form-item-content {
  width: 100%;
}

.form-item-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
</style>
