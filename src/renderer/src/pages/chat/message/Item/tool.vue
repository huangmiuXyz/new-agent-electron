<script setup lang="ts">
import { ToolUIPart } from 'ai'

const props = defineProps<{
  tool_part: ToolUIPart
  message: BaseMessage
}>()

const toolName = computed(() => {
  return props.tool_part.type.split('-')[1]
})
</script>

<template>
  <ChatMessageItemSuggestions v-if="toolName === 'candidateReplies'"
    :suggestionsData="tool_part.input as SuggestionsData" />
  <ChatMessageItemExecCommand :message="message" v-if="toolName === 'exec_command'" :tool_part="tool_part" />

  <ChatMessageItemDynamicTool v-else :tool_part="tool_part" />
</template>

<style scoped>
.msg-row {
  display: flex;
  padding: 4px 0px;
  /* Reduced padding for compactness */
  justify-content: flex-start;
  /* Align left like system messages */
}

.tool-card {
  width: 100%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 1px 2px rgba(var(--text-rgb), 0.03);
  transition: box-shadow 0.2s;
}

.tool-card:hover {
  box-shadow: 0 4px 6px rgba(var(--text-rgb), 0.04);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--bg-hover);
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  user-select: none;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-success);
  /* Success green */
}

.status-text {
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
}

.tool-content {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-sub);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-card);
  max-height: 400px;
  overflow-y: auto;
}

.tool-content.collapsed {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-bottom: none;
  opacity: 0;
}

/* Scrollbar styling for the content */
.tool-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.tool-content::-webkit-scrollbar-track {
  background: transparent;
}

.tool-content::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}

.tool-content::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}
</style>
