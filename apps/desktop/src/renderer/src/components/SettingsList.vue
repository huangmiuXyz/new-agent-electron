<script setup lang="ts">
interface Props {
  count?: number
  countLabel?: string
  searchTerm?: string
  showSearch?: boolean
  searchPlaceholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  count: undefined,
  countLabel: '',
  searchTerm: '',
  showSearch: false,
  searchPlaceholder: '搜索'
})

const emit = defineEmits<{
  'update:searchTerm': [value: string]
}>()
</script>

<template>
  <div class="sl">
    <!-- Header -->
    <div v-if="count !== undefined && $slots['actions']" class="sl-header">
      <div  class="sl-header-title">
        <span class="sl-header-count">{{ count }}</span>
        <span class="sl-header-label">{{ countLabel }}</span>
      </div>
      <div class="sl-header-actions">
        <slot name="actions" />
      </div>
    </div>

    <!-- Search -->
    <div v-if="showSearch" class="sl-search">
      <svg class="sl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        class="sl-search-input"
        :value="searchTerm"
        :placeholder="searchPlaceholder"
        @input="emit('update:searchTerm', ($event.target as HTMLInputElement).value)"
      />
      <button v-if="searchTerm" class="sl-search-clear" @click="emit('update:searchTerm', '')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
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

/* ---- Apple 风格搜索条 ---- */
.sl-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  transition: border-color 0.2s var(--motion-ease-standard);
}

.sl-search:focus-within {
  border-color: var(--border-hover);
}

.sl-search-icon {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.sl-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-stack);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: -0.003em;
}

.sl-search-input::placeholder {
  color: var(--text-tertiary);
}

.sl-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  border: none;
  background: var(--text-tertiary);
  color: var(--bg-card);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.sl-search-clear:hover {
  opacity: 1;
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
