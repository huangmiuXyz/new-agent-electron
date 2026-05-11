<template>
  <ThemeProvider :theme="theme">
    <Incremark
      class="incremark-renderer"
      :blocks="blocks"
      :customCodeBlocks="customCodeBlocks"
      :codeBlockConfigs="codeBlockConfigs"
      v-bind="$attrs"
    />
  </ThemeProvider>
</template>

<script setup lang="ts">
import '@incremark/theme/styles.css'
import { Incremark, ThemeProvider } from '@incremark/vue'
import type { IncremarkContentProps, RenderableBlock } from '@incremark/vue'
import { useSettingsStore } from '@renderer/stores/settings'

defineOptions({
  inheritAttrs: false
})

defineProps<{
  blocks?: RenderableBlock[]
  customCodeBlocks?: IncremarkContentProps['customCodeBlocks']
  codeBlockConfigs?: IncremarkContentProps['codeBlockConfigs']
}>()

const { display } = storeToRefs(useSettingsStore())

const theme = computed(() => (display.value.darkMode ? 'dark' : 'default'))
</script>

<style scoped>
.incremark-renderer {
  max-width: 100%;
  overflow-wrap: break-word;
  color: var(--text-primary);
  background: transparent !important;
}

.incremark-renderer :deep(.incremark-default) {
  color: var(--text-primary);
  background: transparent;
}

.incremark-renderer :deep(.incremark-heading),
.incremark-renderer :deep(.incremark-paragraph),
.incremark-renderer :deep(.incremark-list),
.incremark-renderer :deep(.incremark-list-item),
.incremark-renderer :deep(.incremark-footnote-body),
.incremark-renderer :deep(.incremark-table),
.incremark-renderer :deep(.incremark-table th),
.incremark-renderer :deep(.incremark-table td) {
  color: var(--text-primary);
}

.incremark-renderer :deep(.incremark-link) {
  color: var(--color-primary);
}

.incremark-renderer :deep(.incremark-inline-code) {
  color: var(--text-primary);
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.1em 0.35em;
}

.incremark-renderer :deep(.incremark-code pre),
.incremark-renderer :deep(pre) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  overflow-x: auto;
}

.incremark-renderer :deep(.incremark-code),
.incremark-renderer :deep(.shiki),
.incremark-renderer :deep(.incremark-code-stream) {
  border-radius: 10px;
}

.incremark-renderer :deep(code) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.incremark-renderer :deep(.incremark-blockquote) {
  color: var(--text-secondary);
  border-left: 3px solid var(--border-subtle);
  background: var(--bg-hover);
  border-radius: 0 8px 8px 0;
}

.incremark-renderer :deep(.incremark-hr) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table-wrapper),
.incremark-renderer :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
}

.incremark-renderer :deep(.incremark-table) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table th),
.incremark-renderer :deep(.incremark-table td) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table th) {
  background: var(--bg-hover);
}

.incremark-renderer :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
