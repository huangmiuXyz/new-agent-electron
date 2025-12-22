<script setup lang="ts">
import { computed } from 'vue'
import { ToolUIPart } from 'ai'
import { useTerminal } from '@renderer/composables/useTerminal'

const props = defineProps<{
  tool_part: ToolUIPart
}>()

const { getTerminalIdByToolCallId, forceContinue, tabs } = useTerminal()

const terminalId = computed(() => {
  return getTerminalIdByToolCallId(props.tool_part.toolCallId)
})

const currentTab = computed(() => {
  if (!terminalId.value) return null
  return tabs.value.find((t) => t.id === terminalId.value)
})

const isExecuting = computed(() => {
  return currentTab.value?.isExecuting || !(props.tool_part as any).output
})

const handleForceContinue = () => {
  if (terminalId.value) {
    forceContinue(terminalId.value)
  }
}
</script>

<template>
  <ChatMessageItemDynamicTool :tool_part="tool_part">
    <template v-if="isExecuting" #status>
      <template>
        <span class="status-dot executing"></span>
        <span class="status-text">Executing</span>
        <Button
          size="sm"
          variant="secondary"
          class="force-continue-btn"
          @click.stop="handleForceContinue"
        >
          强制继续
        </Button>
      </template>
    </template>
  </ChatMessageItemDynamicTool>
</template>

<style scoped>
.force-continue-btn {
  height: 20px;
  font-size: 10px;
  padding: 0 6px;
  margin-left: 8px;
}

.status-dot.executing {
  background-color: #3b82f6;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}
</style>
