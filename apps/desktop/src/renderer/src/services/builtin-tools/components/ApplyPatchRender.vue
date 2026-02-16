<script setup lang="ts">
interface PatchAction {
  type: 'add' | 'delete' | 'update'
  path: string
  moveTo?: string
  lines?: string[]
  chunks?: {
    header?: string
    lines: { op: ' ' | '+' | '-'; text: string }[]
    endOfFile?: boolean
  }[]
}

interface ToolInput {
  patch?: string
}

interface ToolOutput {
  summaries?: string[]
  error?: string
}

const props = defineProps<{
  args?: ToolInput
  result?: ToolOutput
  message: any
  tool_part: any
}>()

const isInputCollapsed = ref(true)
const isOutputCollapsed = ref(false)

const toggleInputCollapse = () => {
  isInputCollapsed.value = !isInputCollapsed.value
}

const toggleOutputCollapse = () => {
  isOutputCollapsed.value = !isOutputCollapsed.value
}

const patchText = computed(() => {
  if (typeof props.args === 'string') {
    return props.args
  }
  return props.args?.patch || ''
})

const parsedActions = computed<PatchAction[]>(() => {
  const text = patchText.value
  if (!text) return []

  const actions: PatchAction[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  let cursor = 0
  while (cursor < lines.length) {
    const line = lines[cursor]

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length)
      cursor++
      const addLines: string[] = []
      while (cursor < lines.length && !lines[cursor].startsWith('*** ')) {
        if (lines[cursor].startsWith('+')) {
          addLines.push(lines[cursor].slice(1))
        }
        cursor++
      }
      actions.push({ type: 'add', path, lines: addLines })
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length)
      actions.push({ type: 'delete', path })
      cursor++
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length)
      cursor++

      let moveTo: string | undefined
      if (cursor < lines.length && lines[cursor].startsWith('*** Move to: ')) {
        moveTo = lines[cursor].slice('*** Move to: '.length)
        cursor++
      }

      const chunks: PatchAction['chunks'] = []
      let currentChunk: NonNullable<PatchAction['chunks']>[number] | null = null

      while (cursor < lines.length) {
        const current = lines[cursor]
        if (current.startsWith('*** ')) break

        if (current === '*** End of File') {
          if (!currentChunk) {
            currentChunk = { lines: [] }
            chunks.push(currentChunk)
          }
          currentChunk.endOfFile = true
          cursor++
          continue
        }

        if (current === '@@' || current.startsWith('@@ ')) {
          currentChunk = {
            header: current === '@@' ? undefined : current.slice(3),
            lines: []
          }
          chunks.push(currentChunk)
          cursor++
          continue
        }

        if (current.startsWith(' ') || current.startsWith('+') || current.startsWith('-')) {
          if (!currentChunk) {
            currentChunk = { lines: [] }
            chunks.push(currentChunk)
          }
          currentChunk.lines.push({
            op: current[0] as ' ' | '+' | '-',
            text: current.slice(1)
          })
          cursor++
          continue
        }

        cursor++
      }

      actions.push({ type: 'update', path, moveTo, chunks })
      continue
    }

    cursor++
  }

  return actions
})

const getActionIcon = (type: string) => {
  switch (type) {
    case 'add':
      return 'M12 5v14M5 12h14'
    case 'delete':
      return 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
    case 'update':
      return 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'
    default:
      return ''
  }
}

const getActionLabel = (type: string) => {
  switch (type) {
    case 'add':
      return '新增文件'
    case 'delete':
      return '删除文件'
    case 'update':
      return '更新文件'
    default:
      return type
  }
}

const getActionColor = (type: string) => {
  switch (type) {
    case 'add':
      return 'var(--color-success)'
    case 'delete':
      return 'var(--color-error)'
    case 'update':
      return 'var(--accent-color)'
    default:
      return 'var(--text-secondary)'
  }
}

const summaries = computed(() => {
  return props.result?.summaries || []
})

const hasError = computed(() => {
  return !!props.result?.error
})
</script>

<template>
  <div class="patch-render">
    <!-- 操作概览 -->
    <div class="patch-overview">
      <div v-for="(action, index) in parsedActions" :key="index" class="patch-action"
        :style="{ borderLeftColor: getActionColor(action.type) }">
        <div class="action-header">
          <div class="action-icon" :style="{ color: getActionColor(action.type) }">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="getActionIcon(action.type)" />
            </svg>
          </div>
          <div class="action-info">
            <span class="action-type" :style="{ color: getActionColor(action.type) }">
              {{ getActionLabel(action.type) }}
            </span>
            <span class="action-path">{{ action.path }}</span>
            <span v-if="action.moveTo" class="action-move">
              → {{ action.moveTo }}
            </span>
          </div>
        </div>

        <!-- 代码变更预览 -->
        <div v-if="action.type === 'add' && action.lines" class="code-preview add-preview">
          <div v-for="(line, i) in action.lines.slice(0, 10)" :key="i" class="code-line add-line">
            <span class="line-marker">+</span>
            <span class="line-content">{{ line || ' ' }}</span>
          </div>
          <div v-if="(action.lines?.length || 0) > 10" class="code-line more-line">
            <span class="line-marker"></span>
            <span class="line-content">... 还有 {{ (action.lines?.length || 0) - 10 }} 行</span>
          </div>
        </div>

        <div v-if="action.type === 'update' && action.chunks" class="code-preview">
          <div v-for="(chunk, ci) in action.chunks.slice(0, 3)" :key="ci" class="chunk">
            <div v-if="chunk.header" class="chunk-header">@@ {{ chunk.header }}</div>
            <div v-for="(line, li) in chunk.lines.slice(0, 20)" :key="li" class="code-line"
              :class="{ 'add-line': line.op === '+', 'del-line': line.op === '-', 'ctx-line': line.op === ' ' }">
              <span class="line-marker">{{ line.op }}</span>
              <span class="line-content">{{ line.text || ' ' }}</span>
            </div>
            <div v-if="chunk.lines.length > 20" class="code-line more-line">
              <span class="line-marker"></span>
              <span class="line-content">... 还有 {{ chunk.lines.length - 20 }} 行</span>
            </div>
          </div>
          <div v-if="(action.chunks?.length || 0) > 3" class="more-chunks">
            ... 还有 {{ (action.chunks?.length || 0) - 3 }} 个变更块
          </div>
        </div>
      </div>
    </div>

    <!-- 执行结果 -->
    <div v-if="summaries.length > 0 || hasError" class="result-section"
      :class="{ 'result-error': hasError, 'result-success': !hasError }">
      <div class="result-header" @click="toggleOutputCollapse">
        <div class="result-left">
          <div class="result-icon">
            <svg v-if="hasError" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span class="result-label">{{ hasError ? '执行失败' : '执行成功' }}</span>
          <span v-if="!hasError" class="result-count">({{ summaries.length }} 个文件)</span>
        </div>
        <svg class="collapse-icon" :class="{ collapsed: isOutputCollapsed }"
          xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div class="result-content" :class="{ collapsed: isOutputCollapsed }">
        <div v-if="hasError" class="error-message">{{ result?.error }}</div>
        <div v-else class="success-list">
          <div v-for="(summary, i) in summaries" :key="i" class="success-item">
            {{ summary }}
          </div>
        </div>
      </div>
    </div>

    <!-- 原始 Patch 输入 -->
    <div class="patch-input-section">
      <div class="io-header" @click="toggleInputCollapse">
        <div class="io-left">
          <div class="io-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <span class="io-label">原始 Patch</span>
        </div>
        <svg class="collapse-icon" :class="{ collapsed: isInputCollapsed }"
          xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div class="io-content" :class="{ collapsed: isInputCollapsed }">
        <pre class="patch-raw">{{ patchText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.patch-render {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patch-overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patch-action {
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  border-left: 3px solid;
  overflow: hidden;
}

.action-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-hover);
}

.action-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.action-type {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.action-path {
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  word-break: break-all;
}

.action-move {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.code-preview {
  padding: 8px 10px;
  background: var(--bg-card);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.chunk {
  margin-bottom: 8px;
}

.chunk:last-child {
  margin-bottom: 0;
}

.chunk-header {
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-size: 10px;
}

.code-line {
  display: flex;
  gap: 8px;
  padding: 1px 0;
}

.line-marker {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  user-select: none;
}

.add-line .line-marker {
  color: var(--color-success);
}

.add-line {
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.08);
}

.del-line .line-marker {
  color: var(--color-error);
}

.del-line {
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.08);
}

.ctx-line .line-marker {
  color: var(--text-secondary);
}

.line-content {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
}

.more-line {
  color: var(--text-secondary);
  font-style: italic;
}

.more-chunks {
  padding: 4px 10px;
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
  text-align: center;
}

.result-section {
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.result-success {
  border-left: 3px solid var(--color-success);
}

.result-error {
  border-left: 3px solid var(--color-error);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-hover);
  cursor: pointer;
  user-select: none;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-icon {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.result-success .result-icon {
  color: var(--color-success);
}

.result-error .result-icon {
  color: var(--color-error);
}

.result-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.result-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.result-content {
  padding: 10px;
  background: var(--bg-card);
  max-height: 200px;
  overflow-y: auto;
  transition: all 0.2s ease;
}

.result-content.collapsed {
  max-height: 0;
  padding: 0 10px;
  opacity: 0;
}

.error-message {
  color: var(--color-error);
  font-size: 12px;
  line-height: 1.5;
}

.success-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.success-item {
  font-size: 11px;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  padding: 4px 8px;
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.08);
  border-radius: 4px;
}

.patch-input-section {
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.io-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-active);
  cursor: pointer;
  user-select: none;
}

.io-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.io-icon {
  display: flex;
  align-items: center;
  color: var(--accent-color);
}

.io-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.collapse-icon {
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.io-content {
  max-height: 300px;
  overflow-y: auto;
  transition: all 0.2s ease;
}

.io-content.collapsed {
  max-height: 0;
  opacity: 0;
}

.patch-raw {
  margin: 0;
  padding: 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg-card);
}

/* Scrollbar styling */
.patch-raw::-webkit-scrollbar,
.result-content::-webkit-scrollbar,
.code-preview::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.patch-raw::-webkit-scrollbar-track,
.result-content::-webkit-scrollbar-track,
.code-preview::-webkit-scrollbar-track {
  background: transparent;
}

.patch-raw::-webkit-scrollbar-thumb,
.result-content::-webkit-scrollbar-thumb,
.code-preview::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}

.patch-raw::-webkit-scrollbar-thumb:hover,
.result-content::-webkit-scrollbar-thumb:hover,
.code-preview::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}
</style>
