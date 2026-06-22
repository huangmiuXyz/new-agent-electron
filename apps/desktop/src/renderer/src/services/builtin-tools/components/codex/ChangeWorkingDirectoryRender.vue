<script setup lang="ts">
import CodexSummaryBar from './CodexSummaryBar.vue'
import { extractResultError, extractResultText, toDisplayPath, truncate } from './codexUtils'

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const inputPath = computed(() => String(props.args?.path || ''))
const resultText = computed(() => extractResultText(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

// 从结果文本里提取 previous_cwd / cwd
const parsed = computed(() => {
  const text = resultText.value
  const out = { previous: '', current: '' }
  if (!text) return out
  const prevM = text.match(/previous_cwd:\s*(.+)/)
  const curM = text.match(/cwd:\s*(.+)/)
  if (prevM) out.previous = prevM[1].trim()
  if (curM) out.current = curM[1].trim()
  return out
})

const previousCwd = computed(() => parsed.value.previous)
const currentCwd = computed(() => parsed.value.current)
</script>

<template>
  <div class="cwd-render">
    <CodexSummaryBar :text="inputPath" :path="inputPath" :message="message" />

    <div v-if="hasError" class="error-box">{{ truncate(errorMsg, 1000) }}</div>

    <div v-else-if="previousCwd || currentCwd" class="cwd-compare">
      <div v-if="previousCwd" class="cwd-line prev">
        <span class="cwd-tag">原</span>
        <span class="cwd-path">{{ toDisplayPath(previousCwd) }}</span>
      </div>
      <div v-if="previousCwd && currentCwd" class="cwd-arrow">↓</div>
      <div v-if="currentCwd" class="cwd-line curr">
        <span class="cwd-tag">新</span>
        <span class="cwd-path">{{ toDisplayPath(currentCwd) }}</span>
      </div>
    </div>

    <div v-else-if="resultText" class="raw-output">{{ truncate(resultText, 2000) }}</div>

    <div v-else class="empty-hint">切换中…</div>
  </div>
</template>

<style scoped>
.cwd-render {
  display: flex;
  flex-direction: column;
}

.error-box {
  padding: 6px 8px;
  color: var(--color-error);
  font-size: 11px;
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.06);
}

.cwd-compare {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cwd-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.cwd-tag {
  flex: none;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.cwd-line.curr .cwd-tag {
  color: var(--color-success);
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.1);
}

.cwd-path {
  color: var(--text-primary);
  word-break: break-all;
}

.cwd-arrow {
  padding-left: 16px;
  color: var(--text-tertiary);
  font-size: 10px;
}

.raw-output {
  padding: 8px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-hint {
  padding: 8px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
