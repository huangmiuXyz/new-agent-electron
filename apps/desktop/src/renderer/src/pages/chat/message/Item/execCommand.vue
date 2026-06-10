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
        <div class="command-approval" aria-label="命令需要批准">
          <span class="command-approval-pulse" aria-hidden="true"></span>
          <span class="command-approval-label">需批准</span>
          <button
            class="status-icon-btn approve"
            type="button"
            title="允许执行命令"
            aria-label="允许执行命令"
            @click.stop="handleApproval(true)"
          >
            <Check />
          </button>
          <button
            class="status-icon-btn reject"
            type="button"
            title="拒绝执行命令"
            aria-label="拒绝执行命令"
            @click.stop="handleApproval(false)"
          >
            <Close />
          </button>
        </div>
      </template>
      <template v-else-if="isExecuting">
        <button
          class="status-icon-btn continue"
          type="button"
          title="强制继续"
          @click.stop="handleForceContinue"
        >
          <Continue />
        </button>
      </template>
    </template>
  </ChatMessageItemDynamicTool>
</template>

<style scoped>
.command-approval {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0;
}

.command-approval-pulse {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--color-warning, #faad14);
  animation: approval-dot 1.8s ease-out infinite;
  flex: none;
}

.command-approval-label {
  color: color-mix(in srgb, var(--color-warning, #faad14) 62%, var(--text-secondary));
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  margin-right: 1px;
}

.status-icon-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 0;
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

.status-icon-btn.approve {
  color: var(--color-success);
}

.status-icon-btn.approve:hover {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.status-icon-btn.reject {
  color: var(--text-tertiary);
}

.status-icon-btn.reject:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
}

.status-icon-btn.continue:hover {
  color: var(--accent-color);
}

.status-dot.executing {
  background-color: var(--accent-color);
  animation: pulse 2s infinite;
}

:deep(.tool-container:has(.command-approval)) {
  border-color: color-mix(in srgb, var(--color-warning, #faad14) 18%, var(--border-color-light));
}

:deep(.tool-container:has(.command-approval) .tool-header) {
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-warning, #faad14) 7%, transparent),
      transparent 68%
    ),
    color-mix(in srgb, var(--color-warning, #faad14) 3%, transparent);
}

:deep(.tool-container:has(.command-approval) .tool-icon),
:deep(.tool-container:has(.command-approval) .tool-name) {
  color: color-mix(in srgb, var(--color-warning, #faad14) 52%, var(--text-secondary));
}

@keyframes approval-dot {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-warning, #faad14) 42%, transparent);
  }

  70% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-warning, #faad14) 0%, transparent);
  }

  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-warning, #faad14) 0%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .command-approval-pulse,
  .status-dot.executing {
    animation: none;
  }
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
