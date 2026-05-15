<script setup lang="ts">
import { DynamicToolUIPart, ToolUIPart } from 'ai'
import { getBuiltinTools } from '@renderer/services/builtin-tools'
import type { MenuItem } from '@renderer/composables/useContextMenu'

const props = defineProps<{
  tool_part: DynamicToolUIPart | ToolUIPart
  allowCustomRender?: boolean
  message?: BaseMessage
}>()
const { display } = storeToRefs(useSettingsStore())
const { currentChat } = storeToRefs(useChatsStores())
const { showContextMenu } = useContextMenu<{ toolCallId: string }>()
const { Refresh } = useIcon(['Refresh'])
const isCollapsed = ref(!display.value.expandToolsByDefault)

const isInputCollapsed = ref(true)
const isOutputCollapsed = ref(true)

const isEditingInput = ref(false)
const isEditingOutput = ref(false)
const localInput = ref('')
const localOutput = ref('')
const isRunning = ref(false)
const toolCallId = computed(() => (props.tool_part as { toolCallId?: string }).toolCallId || '')

const toggleInputCollapse = () => {
  if (!isEditingInput.value) {
    isInputCollapsed.value = !isInputCollapsed.value
  }
}

const toggleOutputCollapse = () => {
  if (!isEditingOutput.value) {
    isOutputCollapsed.value = !isOutputCollapsed.value
  }
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleEditInput = (e: Event) => {
  e.stopPropagation()
  if (isEditingInput.value) {
    props.tool_part.input = deserializeEditorInput(localInput.value, props.tool_part.input)
  } else {
    isInputCollapsed.value = false
  }
  isEditingInput.value = !isEditingInput.value
}

const toggleEditOutput = (e: Event) => {
  e.stopPropagation()
  if (isEditingOutput.value) {
    // Save changes
    props.tool_part.output = localOutput.value
  } else {
    isOutputCollapsed.value = false
  }
  isEditingOutput.value = !isEditingOutput.value
}

const runTool = async (e: Event) => {
  e.stopPropagation()
  if (!toolName.value) return

  isRunning.value = true
  isInputCollapsed.value = false
  isOutputCollapsed.value = false

  try {
    const tools = getBuiltinTools()
    const tool = tools[toolName.value]

    if (tool && tool.execute) {
      const args = deserializeEditorInput(localInput.value, props.tool_part.input)

      const options = {
        chatId: props.message?.metadata?.cid || (props.message as any)?.chatId,
        model: props.message?.metadata?.model,
        provider: props.message?.metadata?.provider
      }

      const result = await (tool.execute as any)(args, options)

      // Handle result format
      let outputText = ''
      const anyResult = result as any
      if (anyResult.toolResult && Array.isArray(anyResult.toolResult.content)) {
        outputText = anyResult.toolResult.content
          .map((c: any) => c.type === 'text' ? c.text : '')
          .join('\n')
      } else {
        outputText = JSON.stringify(result, null, 2)
      }

      localOutput.value = outputText
      props.tool_part.output = outputText
    }
  } catch (error) {
    console.error('Tool execution failed', error)
    localOutput.value = `Error: ${(error as Error).message}`
    props.tool_part.output = localOutput.value
  } finally {
    isRunning.value = false
  }
}

const toolName = computed(() => {
  if ('toolName' in props.tool_part) {
    return props.tool_part.toolName
  }
  return props.tool_part.type?.split('-')[1]
})

const customRender = computed(() => {
  if (!props.allowCustomRender || !toolName.value) return null
  try {
    const tool = getBuiltinTools()[toolName.value]
    return tool?.render || null
  } catch (e) {
    return null
  }
})

const isSingleCmdInput = (value: unknown): value is { cmd: string } => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { cmd?: unknown }).cmd === 'string'
  )
}

const extractToolResultText = (value: unknown) => {
  const toolResult = (value as { toolResult?: { content?: Array<{ type?: string; text?: string }> } })?.toolResult
  if (!toolResult || !Array.isArray(toolResult.content)) return ''

  return toolResult.content
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
}

const serializeForEditor = (value: unknown) => {
  if (isSingleCmdInput(value)) return value.cmd
  if (typeof value === 'string') return value
  if (value == null) return ''

  const toolResultText = extractToolResultText(value)
  if (toolResultText) return toolResultText

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const decodeEscapedText = (value: string) => {
  if (!value || (!value.includes('\\n') && !value.includes('\\r') && !value.includes('\\\\'))) {
    return value
  }

  try {
    return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  } catch {
    return value
  }
}

const deserializeEditorInput = (text: string, originalValue: unknown) => {
  if (isSingleCmdInput(originalValue)) {
    return { cmd: text }
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const initLocalState = () => {
  if (customRender.value) return
  localInput.value = serializeForEditor(props.tool_part.input)
  localOutput.value = decodeEscapedText(serializeForEditor(props.tool_part.output))
}

watch(
  () => [props.tool_part.input, props.tool_part.output, customRender.value],
  () => {
    initLocalState()
  },
  { immediate: true }
)

const canRetryAroundToolCall = computed(() => {
  return Boolean(props.message?.role === 'assistant' && toolCallId.value && currentChat.value?.id)
})

const getRetryMenuItems = (): MenuItem<{ toolCallId: string }>[] => [
  {
    label: '从此处以上重试',
    icon: Refresh,
    onClick: ({ toolCallId }) => {
      if (!currentChat.value?.id) return
      const { retryFromToolCall } = useChat(currentChat.value.id)
      retryFromToolCall(toolCallId, 'above')
    }
  },
  {
    label: '从此处以下重试',
    icon: Refresh,
    onClick: ({ toolCallId }) => {
      if (!currentChat.value?.id) return
      const { retryFromToolCall } = useChat(currentChat.value.id)
      retryFromToolCall(toolCallId, 'below')
    }
  }
]

const openRetryContextMenu = (event: MouseEvent) => {
  if (!canRetryAroundToolCall.value) return
  showContextMenu(event, getRetryMenuItems(), { toolCallId: toolCallId.value })
}

const openRetryMenuFromButton = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  openRetryContextMenu(event)
}
</script>

<template>
  <div class="msg-row tool-row">
    <div class="tool-container" :class="{ 'is-expanded': !isCollapsed }" @contextmenu="openRetryContextMenu">
      <div class="tool-header" @click="toggleCollapse">
        <div class="tool-info">
          <div class="tool-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <span class="tool-name">{{
            (tool_part as DynamicToolUIPart)?.toolName || tool_part?.title || toolName
          }}</span>
        </div>
        <div class="tool-status-right" @click.stop @mousedown.stop>
          <slot name="status">
            <span class="status-dot"></span>
          </slot>
        </div>
        <button
          v-if="canRetryAroundToolCall"
          class="retry-tool-btn"
          type="button"
          title="重试选项"
          @click="openRetryMenuFromButton"
        >
          <Refresh />
        </button>
        <div class="tool-toggle">
           <svg class="header-collapse-icon" :class="{ collapsed: isCollapsed }" xmlns="http://www.w3.org/2000/svg"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      <div class="tool-content-wrapper" v-if="!isCollapsed">
        <slot name="content">
          <component v-if="customRender" :message="message" :is="customRender" :args="tool_part.input"
            :result="tool_part.output" :tool_part="tool_part" />
          <div v-else class="io-container">
            <div class="io-section io-input">
              <div class="io-header" @click="toggleInputCollapse">
                <span class="io-label">输入</span>
                <div class="io-actions">
                   <button class="icon-btn" @click.stop="runTool" title="运行工具" :disabled="isRunning">
                    <svg v-if="!isRunning" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <svg v-else class="spin" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                  </button>
                  <button class="icon-btn" @click.stop="toggleEditInput" :title="isEditingInput ? '保存' : '编辑'">
                    <svg v-if="!isEditingInput" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                </div>
                <svg class="collapse-icon" :class="{ collapsed: isInputCollapsed }" xmlns="http://www.w3.org/2000/svg"
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div class="io-content" v-if="!isInputCollapsed">
                <textarea v-if="isEditingInput" v-model="localInput" class="io-textarea" @click.stop></textarea>
                <div v-else>{{ localInput }}</div>
              </div>
            </div>
            <div class="io-section io-output" v-if="tool_part.output || isEditingOutput">
              <div class="io-header" @click="toggleOutputCollapse">
                <span class="io-label">输出</span>
                <div class="io-actions">
                  <button class="icon-btn" @click.stop="toggleEditOutput" :title="isEditingOutput ? '保存' : '编辑'">
                    <svg v-if="!isEditingOutput" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                </div>
                <svg class="collapse-icon" :class="{ collapsed: isOutputCollapsed }" xmlns="http://www.w3.org/2000/svg"
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div class="io-content" v-if="!isOutputCollapsed">
                <textarea v-if="isEditingOutput" v-model="localOutput" class="io-textarea" @click.stop></textarea>
                <VirtualParagraphText
                  v-else
                  class="io-virtual-output"
                  :text="localOutput"
                  :height="300"
                  split-mode="newline"
                  preserve-empty
                  :font-size="10"
                  :line-height="15"
                  :paragraph-padding-block="0"
                  :paragraph-gap="0"
                  :min-paragraph-height="15"
                  :fixed-item-height="15"
                  stick-to-bottom
                />
              </div>
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  padding: 1px 0px; /* 极致压缩垂直间距 */
  justify-content: flex-start;
}

.tool-container {
  width: 100%;
  border-radius: 4px;
  transition: all 0.2s;
  /* 默认无边框无背景 */
  background: transparent;
  border: 1px solid transparent;
}

/* 展开时显示边框背景，以便阅读内容 */
.tool-container.is-expanded {
  background-color: var(--bg-card);
  border-color: var(--border-color-light);
  margin-bottom: 4px; /* 展开时给一点下边距 */
}

.tool-header {
  display: flex;
  align-items: center;
  padding: 2px 4px; /* 极致压缩 header padding */
  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  min-height: 20px;
  gap: 4px;
}

.tool-header:hover {
  background-color: var(--bg-hover);
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.tool-icon {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  opacity: 0.8;
}

.tool-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary); /* 默认用次级颜色，不抢眼 */
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-status-right {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-success);
  opacity: 0.8;
}

.retry-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  flex: none;
}

.retry-tool-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.retry-tool-btn :deep(svg) {
  width: 10px;
  height: 10px;
}

.tool-toggle {
  display: flex;
  align-items: center;
  color: var(--text-tertiary); /* 很淡的箭头 */
  padding-left: 0;
}

.header-collapse-icon {
  transition: transform 0.2s ease;
}

.header-collapse-icon.collapsed {
  transform: rotate(-90deg);
}

/* Content Area */
.tool-content-wrapper {
  border-top: 1px solid var(--border-color-light);
  padding: 0;
}

/* IO Container */
.io-container {
  display: flex;
  flex-direction: column;
}

.io-section {
  border-bottom: 1px solid var(--border-color-light);
}

.io-section:last-child {
  border-bottom: none;
}

.io-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
  font-size: 9px;
  background-color: rgba(0,0,0,0.01);
}

.io-header:hover {
  background-color: var(--bg-hover);
}

.io-label {
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  flex: 1;
}

.collapse-icon {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.io-content {
  padding: 8px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-card);
}

.io-virtual-output {
  color: var(--text-primary);
  font-family: inherit;
  scrollbar-width: thin;
}

.io-virtual-output :deep(.virtual-paragraph-text__paragraph) {
  color: var(--text-primary);
  font-family: inherit;
  white-space: pre;
  overflow-wrap: normal;
  word-break: normal;
}

/* Scrollbar */
.io-virtual-output::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.io-virtual-output::-webkit-scrollbar-track {
  background: transparent;
}
.io-virtual-output::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 2px;
}
.io-virtual-output::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}

.io-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
  margin-right: 8px;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: var(--text-secondary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.io-textarea {
  width: 100%;
  min-height: 60px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px;
  font-family: inherit;
  font-size: inherit;
  resize: vertical;
}
</style>
