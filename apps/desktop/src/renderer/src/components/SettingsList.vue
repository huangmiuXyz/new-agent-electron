<script setup lang="ts">
interface Props {
  count?: number
  countLabel?: string
}

withDefaults(defineProps<Props>(), {
  count: undefined,
  countLabel: ''
})
</script>

<template>
  <div class="sl">
    <!-- Header -->
    <div class="sl-header">
      <div v-if="count !== undefined" class="sl-header-title">
        <span class="sl-header-count">{{ count }}</span>
        <span class="sl-header-label">{{ countLabel }}</span>
      </div>
      <div class="sl-header-actions">
        <slot name="actions" />
      </div>
    </div>

    <!-- Groups -->
    <slot />

    <!-- Empty state -->
    <div v-if="count === 0" class="sl-empty">
      <slot name="empty" />
    </div>
  </div>
</template>

<style scoped>
.sl {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 2px 24px;
}

.sl-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sl-header-title {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-left: 2px;
}

.sl-header-count {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.sl-header-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.sl-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 56px 24px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

/* ---- empty state sub-elements (shared) ---- */
.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.3;
}

.empty-icon :deep(svg) {
  font-size: 36px;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
}
</style>