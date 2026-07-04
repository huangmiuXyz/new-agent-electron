<script setup lang="ts">
import CodexSummaryBar from './CodexSummaryBar.vue'
import {
  extractResultError,
  extractResultText,
  openInCanvas,
  parseSearchSummary,
  toDisplayPath,
  truncate
} from './codexUtils'

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const cmd = computed(() => String(props.args?.cmd || ''))
const resultText = computed(() => extractResultText(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

const parsed = computed(() => parseSearchSummary(resultText.value))

const handleOpen = (path: string) => {
  const ok = openInCanvas(path, props.message)
  if (!ok) messageApi.warning('该文件不在当前 Canvas 工作区内，无法打开')
}
</script>

<template>
  <div class="search-render">
    <CodexSummaryBar :text="cmd" mono :message="message" />

    <div v-if="hasError" class="error-box">{{ errorMsg }}</div>

    <template v-else>
      <!-- 候选文件 -->
      <div v-if="parsed.candidates.length > 0" class="candidates">
        <div class="section-label">
          命中文件 ({{ parsed.candidates.length }})
        </div>
        <div
          v-for="(c, i) in parsed.candidates"
          :key="i"
          class="candidate-item"
          @click="handleOpen(c.path)"
        >
          <span class="c-icon" aria-hidden="true">›</span>
          <span class="c-path">{{ toDisplayPath(c.path) }}</span>
          <span v-if="c.count" class="c-count">{{ c.count }}处</span>
          <span v-if="c.lines && c.lines.length" class="c-lines">:{{ c.lines[0] }}</span>
        </div>
      </div>

      <!-- 首条命中预览 -->
      <div v-if="parsed.candidates[0]?.preview" class="preview-line">
        {{ truncate(parsed.candidates[0].preview, 200) }}
      </div>

      <!-- 原始输出（折叠） -->
      <!-- <div v-if="rawOutput" class="raw-section">
        <div class="raw-header" @click="isOutputExpanded = !isOutputExpanded">
          <span>原始输出</span>
          <span class="toggle">{{ isOutputExpanded ? '▾' : '▸' }}</span>
        </div>
        <pre v-if="isOutputExpanded" class="raw-output">{{ rawOutput }}</pre>
      </div> -->

      <div v-if="!hasError && !resultText" class="empty-hint">命令执行中或无输出</div>
    </template>
  </div>
</template>

<style scoped>
.search-render {
  display: flex;
  flex-direction: column;
}

.error-box {
  padding: 6px 8px;
  color: var(--color-error);
  font-size: 11px;
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.06);
}

.section-label {
  padding: 4px 8px 2px;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.candidates {
  display: flex;
  flex-direction: column;
  padding-bottom: 4px;
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.candidate-item:hover {
  background: var(--bg-hover);
}

.c-icon {
  color: var(--text-tertiary);
  flex: none;
}

.c-path {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.candidate-item:hover .c-path {
  color: var(--accent-color);
  text-decoration: underline;
}

.c-count {
  flex: none;
  font-size: 9px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-radius: 3px;
  padding: 0 4px;
}

.c-lines {
  flex: none;
  color: var(--text-tertiary);
}

.preview-line {
  padding: 2px 8px 4px;
  font-size: 10px;
  color: var(--text-secondary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  border-top: 1px solid var(--border-color-light);
}

.raw-section {
  border-top: 1px solid var(--border-color-light);
}

.raw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  font-size: 9px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.raw-header:hover {
  background: var(--bg-hover);
}

.toggle {
  font-size: 10px;
}

.raw-output {
  margin: 0;
  padding: 6px 8px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.02);
}

.empty-hint {
  padding: 8px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}

.raw-output::-webkit-scrollbar {
  width: 6px;
}

.raw-output::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}
</style>
