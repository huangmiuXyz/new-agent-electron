<script setup lang="ts">
import { computed } from 'vue'
import { ToolUIPart } from 'ai'
import { useTerminal } from '@renderer/composables/useTerminal'

const props = defineProps<{
  tool_part: ToolUIPart
  message: BaseMessage
}>()
const { Check, Close, Continue } = useIcon(['Check', 'Close', 'Continue'])

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
    return
  }

  messageApi.warning('未找到对应终端，暂时无法强制继续')
}

const { currentChat } = useChatsStores()
const handleApproval = (resolve: boolean) => {
  const { approval } = useChat(currentChat?.id!)
  approval(props.tool_part, resolve)
}
</script>

<template>
  <ChatMessageItemDynamicTool :key="tool_part.state" :tool_part="tool_part" :message="message">
    <template #status>
      <template v-if="tool_part.state === 'approval-requested'">
        <button class="status-icon-btn approve" type="button" title="允许" @click.stop="handleApproval(true)">
          <Check />
        </button>
        <button class="status-icon-btn reject" type="button" title="拒绝" @click.stop="handleApproval(false)">
          <Close />
        </button>
      </template>
      <template v-else-if="isExecuting">
        <button class="status-icon-btn continue" type="button" title="强制继续" @click.stop="handleForceContinue">
          <Continue />
        </button>
      </template>
    </template>
  </ChatMessageItemDynamicTool>
</template>

<style scoped>
.status-icon-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 4px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 0;
  flex: none;
}

.status-icon-btn:hover {
  background: var(--bg-hover);
}

.status-icon-btn :deep(svg) {
  width: 10px;
  height: 10px;
  display: block;
  flex: none;
}

.status-icon-btn.approve:hover {
  color: var(--color-success);
}

.status-icon-btn.reject:hover {
  color: var(--color-error);
}

.status-icon-btn.continue:hover {
  color: var(--accent-color);
}

.status-dot.executing {
  background-color: var(--accent-color);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.7);
  }

  70% {
    transform: scale(1);
    box-shadow: 0 0 0 4px rgba(var(--accent-rgb), 0);
  }

  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0);
  }
}
</style>
