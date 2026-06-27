<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="sg">
    <div class="sg-label">{{ label }}</div>
    <div class="sg-group">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sg {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sg-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-left: 4px;
}

.sg-group {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}
</style>