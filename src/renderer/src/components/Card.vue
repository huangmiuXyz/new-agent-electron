<script setup lang="ts">
interface Props {
  padding?: string
  background?: string
  border?: boolean
  radius?: string
  hoverable?: boolean
}

withDefaults(defineProps<Props>(), {
  padding: '0',
  background: 'var(--bg-secondary, #f5f5f7)',
  border: true,
  radius: 'var(--radius-md, 10px)',
  hoverable: false
})
</script>

<template>
  <div
    class="card"
    :class="{ 'is-border': border, 'is-hoverable': hoverable }"
    :style="{
      padding: padding,
      backgroundColor: background,
      borderRadius: radius
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.card {
  overflow: hidden;
  transition: all 0.2s ease;
  width: 100%;
}

.card.is-border {
  border: 1px solid var(--border-subtle);
}

.card.is-hoverable:hover {
  background-color: var(--bg-hover) !important;
  cursor: pointer;
}
</style>
