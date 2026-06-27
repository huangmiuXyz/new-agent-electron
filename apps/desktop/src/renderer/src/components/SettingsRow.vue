<script setup lang="ts">
interface Props {
  name: string
  desc?: string
  clickable?: boolean
  mono?: boolean
  muted?: boolean
  dot?: boolean
  dotColor?: string
  fadeActions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  desc: '',
  clickable: false,
  mono: false,
  muted: false,
  dot: false,
  dotColor: 'var(--color-primary)',
  fadeActions: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <div
    class="sr"
    :class="{ 'sr--clickable': clickable, 'sr--fade-actions': fadeActions }"
    @click="emit('click', $event)"
  >
    <div class="sr-icon">
      <slot name="icon" />
      <span v-if="dot" class="sr-dot" :style="{ background: dotColor }" />
    </div>

    <div class="sr-info">
      <div class="sr-name" :class="{ 'sr-name--muted': muted }">
        {{ name }}
      </div>
      <div v-if="desc" class="sr-desc" :class="{ 'sr-desc--mono': mono }">
        {{ desc }}
      </div>
    </div>

    <div class="sr-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.sr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  position: relative;
  transition: background-color 0.18s var(--motion-ease-standard);
}

.sr:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 52px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--border-subtle);
}

.sr--clickable {
  cursor: pointer;
}

.sr--clickable:active {
  background: var(--bg-hover);
}

/* ---------- icon ---------- */
.sr-icon {
  flex-shrink: 0;
  position: relative;
}

.sr-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 8px;
  height: 8px;
  border: 2px solid var(--bg-card);
  border-radius: 9999px;
  box-sizing: content-box;
}

/* ---------- info ---------- */
.sr-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.sr-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.31;
  letter-spacing: -0.008em;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-name--muted {
  color: var(--text-secondary);
  font-weight: 500;
}

.sr-desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.36;
  letter-spacing: -0.003em;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sr-desc--mono {
  font-family: 'SF Mono', ui-monospace, monospace;
}

/* ---------- actions ---------- */
.sr-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* fade-actions: actions start dim, appear on row hover */
.sr--fade-actions .sr-actions {
  opacity: 0.3;
  transition: opacity 0.2s var(--motion-ease-standard);
}

.sr--fade-actions:hover .sr-actions {
  opacity: 1;
}

/* ---- action buttons (shared) ---- */
.action-btn {
  color: var(--text-tertiary) !important;
  border-radius: 6px !important;
  transition: color 0.15s var(--motion-ease-standard),
    background-color 0.15s var(--motion-ease-standard),
    transform 0.1s var(--motion-ease-standard) !important;
}

.action-btn:hover {
  color: var(--text-primary) !important;
  background: var(--bg-hover) !important;
}

.action-btn:active { transform: scale(0.9); }
.delete-btn:hover { color: var(--color-danger) !important; }
</style>