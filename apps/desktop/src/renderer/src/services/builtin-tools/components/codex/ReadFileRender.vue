<script setup lang="ts">
import CodexSummaryBar from './CodexSummaryBar.vue'
import {
  extractResultError,
  extractResultText,
  parseHashline,
  truncate
} from './codexUtils'

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const DEFAULT_PREVIEW_LINES = 60

const filePath = computed(() => String(props.args?.path || ''))
const startLine = computed(() => {
  const n = Number(props.args?.start_line)
  return Number.isFinite(n) && n > 0 ? n : null
})
const endLine = computed(() => {
  const n = Number(props.args?.end_line)
  return Number.isFinite(n) && n > 0 ? n : null
})

const resultText = computed(() => extractResultText(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

const parsed = computed(() => parseHashline(resultText.value))

// 行范围徽标优先用输入参数，回退到解析出的首末行
const lineBadge = computed(() => {
  const start = startLine.value ?? parsed.value.firstLine
  const end = endLine.value ?? parsed.value.lastLine
  if (start === null && end === null) return ''
  if (start !== null && end !== null) return `${start}-${end}`
  return `${start ?? end}`
})

// 解析出的真实文件路径（hashline 头里的优先）
const displayPath = computed(() => {
  return parsed.value.header?.path || filePath.value
})

const isExpanded = ref(false)
const visibleLines = computed(() => {
  if (isExpanded.value) return parsed.value.lines
  return parsed.value.lines.slice(0, DEFAULT_PREVIEW_LINES)
})
const hasMore = computed(() => parsed.value.lines.length > DEFAULT_PREVIEW_LINES)
</script>

<template>
  <div class="read-file-render">
    <CodexSummaryBar
      :text="displayPath"
      :path="displayPath"
      :badge="lineBadge"
      :message="message"
    />

    <div v-if="hasError" class="error-box">{{ errorMsg }}</div>

    <div v-else-if="parsed.lines.length > 0" class="file-content">
      <div class="code-line" v-for="line in visibleLines" :key="line.num">
        <span class="line-num">{{ line.num }}</span>
        <span class="line-text">{{ line.text }}</span>
      </div>
      <div v-if="hasMore && !isExpanded" class="more-toggle" @click="isExpanded = true">
        … 还有 {{ parsed.lines.length - DEFAULT_PREVIEW_LINES }} 行，点击展开全部
      </div>
      <div v-else-if="isExpanded && parsed.lines.length > DEFAULT_PREVIEW_LINES" class="more-toggle"
        @click="isExpanded = false">
        收起
      </div>
    </div>

    <div v-else-if="resultText && !hasError" class="raw-output">
      {{ truncate(resultText, 5000) }}
    </div>

    <div v-else class="empty-hint">暂无文件内容</div>
  </div>
</template>

<style scoped>
.read-file-render {
  display: flex;
  flex-direction: column;
}

.error-box {
  padding: 6px 8px;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.5;
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.06);
}

.file-content {
  padding: 4px 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 10px;
  line-height: 1.5;
  max-height: 320px;
  overflow-y: auto;
}

.code-line {
  display: flex;
  gap: 8px;
  padding: 0 8px;
  white-space: pre;
}

.code-line:hover {
  background: var(--bg-hover);
}

.line-num {
  flex: none;
  width: 36px;
  text-align: right;
  color: var(--text-tertiary);
  user-select: none;
}

.line-text {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
}

.more-toggle {
  padding: 4px 8px;
  font-size: 10px;
  color: var(--accent-color);
  cursor: pointer;
  text-align: center;
  font-style: italic;
}

.more-toggle:hover {
  text-decoration: underline;
}

.raw-output {
  padding: 8px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 320px;
  overflow-y: auto;
}

.empty-hint {
  padding: 8px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}

.file-content::-webkit-scrollbar,
.raw-output::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.file-content::-webkit-scrollbar-thumb,
.raw-output::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}
</style>
