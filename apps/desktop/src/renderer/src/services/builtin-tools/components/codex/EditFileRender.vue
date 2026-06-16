<script setup lang="ts">
import {
  extractResultError,
  extractResultSummary,
  truncate
} from './codexUtils'

type EditOp =
  | { kind: 'replace'; start: number; end: number; adds: string[] }
  | { kind: 'delete'; start: number; end: number }
  | { kind: 'insert'; anchor: number | 'head' | 'tail'; position: string; adds: string[] }

type PatchFileOp = {
  op: 'add' | 'delete' | 'update'
  path: string
  moveTo?: string
  lines: { sign: '+' | '-' | ' ' | ''; text: string }[]
}

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const editType = computed(() => {
  const t = String(props.args?.type || 'update')
  return ['update', 'add', 'delete', 'move'].includes(t) ? t : 'update'
})
const path = computed(() => String(props.args?.path || ''))
const newPath = computed(() => String(props.args?.new_path || ''))
const content = computed(() => String(props.args?.content || ''))

const summary = computed(() => extractResultSummary(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

// 补丁模式检测：content 中包含 *** Begin Patch
const isPatchMode = computed(() => content.value.includes('*** Begin Patch'))

// 解析 hashline 编辑内容里的文件头
const headerPath = computed(() => {
  const m = content.value.match(/^¶(.+?)#/m)
  return m ? m[1] : ''
})
const displayPath = computed(() => headerPath.value || path.value)

// 解析 add 类型内容预览
const addPreviewLines = computed(() => {
  if (editType.value !== 'add') return []
  return content.value.replace(/\r\n/g, '\n').split('\n').slice(0, 10)
})

// 解析补丁格式
const patchOps = computed<PatchFileOp[]>(() => {
  if (!isPatchMode.value) return []
  const lines = content.value.replace(/\r\n/g, '\n').split('\n')
  const ops: PatchFileOp[] = []
  let current: PatchFileOp | null = null

  for (const line of lines) {
    if (line.startsWith('*** Add File: ')) {
      current = { op: 'add', path: line.slice('*** Add File: '.length).trim(), lines: [] }
      ops.push(current)
      continue
    }
    if (line.startsWith('*** Delete File: ')) {
      current = { op: 'delete', path: line.slice('*** Delete File: '.length).trim(), lines: [] }
      ops.push(current)
      continue
    }
    if (line.startsWith('*** Update File: ')) {
      current = { op: 'update', path: line.slice('*** Update File: '.length).trim(), lines: [] }
      ops.push(current)
      continue
    }
    if (line.startsWith('*** Move to: ') && current) {
      current.moveTo = line.slice('*** Move to: '.length).trim()
      continue
    }
    if (line.startsWith('*** ') || !current) continue

    if (line.startsWith('+')) {
      current.lines.push({ sign: '+', text: line.slice(1) })
    } else if (line.startsWith('-')) {
      current.lines.push({ sign: '-', text: line.slice(1) })
    } else if (line.startsWith('@@')) {
      current.lines.push({ sign: '', text: line })
    } else {
      current.lines.push({ sign: ' ', text: line })
    }
  }

  return ops
})

const patchTotalChanges = computed(
  () => patchOps.value.reduce((sum, op) => sum + op.lines.filter((l) => l.sign === '+' || l.sign === '-').length, 0)
)

// 解析 update 类型的编辑操作
const ops = computed<EditOp[]>(() => {
  if (editType.value !== 'update' || !content.value) return []
  const lines = content.value.replace(/\r\n/g, '\n').split('\n')
  const result: EditOp[] = []
  let i = 0
  // 跳过文件头
  while (i < lines.length && !lines[i].startsWith('¶')) i++
  i++

  while (i < lines.length) {
    const line = lines[i]
    const replaceM = line.match(/^replace\s+(\d+)\.\.(\d+):\s*$/)
    if (replaceM) {
      const adds: string[] = []
      i++
      while (i < lines.length && lines[i].startsWith('+')) {
        adds.push(lines[i].slice(1))
        i++
      }
      result.push({ kind: 'replace', start: Number(replaceM[1]), end: Number(replaceM[2]), adds })
      continue
    }
    const deleteM = line.match(/^delete\s+(\d+)\.\.(\d+)\s*$/)
    if (deleteM) {
      result.push({ kind: 'delete', start: Number(deleteM[1]), end: Number(deleteM[2]) })
      i++
      continue
    }
    const insertM = line.match(/^insert\s+(before|after|head|tail)\s*(?:(\d+))?:\s*$/)
    if (insertM) {
      const position = insertM[1]
      const anchor = insertM[2] ? Number(insertM[2]) : (position as 'head' | 'tail')
      const adds: string[] = []
      i++
      while (i < lines.length && lines[i].startsWith('+')) {
        adds.push(lines[i].slice(1))
        i++
      }
      result.push({ kind: 'insert', anchor: anchor as number | 'head' | 'tail', position, adds })
      continue
    }
    i++
  }
  return result
})

const totalChanges = computed(() => ops.value.length)
</script>

<template>
  <div class="edit-file-render">
    <CodexSummaryBar
      v-if="!isPatchMode"
      :text="editType === 'move' ? `${displayPath} → ${newPath}` : displayPath"
      :path="editType === 'move' ? newPath : displayPath"
      :badge="editType !== 'update' ? editType : `${totalChanges}处改动`"
      :message="message"
    />
    <CodexSummaryBar
      v-else
      text="补丁编辑"
      :badge="`${patchOps.length}个文件 / ${patchTotalChanges}处改动`"
      :message="message"
    />

    <!-- patch 模式：补丁预览 -->
    <div v-if="isPatchMode && patchOps.length > 0" class="patch-preview">
      <div v-for="(op, i) in patchOps" :key="i" class="patch-file">
        <div class="patch-file-header">
          <span class="patch-op-tag" :class="op.op">
            {{ op.op === 'add' ? '➕ 新增' : op.op === 'delete' ? '🗑 删除' : '✏ 更新' }}
          </span>
          <span class="patch-file-path">{{ op.path }}</span>
          <span v-if="op.moveTo" class="patch-move">→ {{ op.moveTo }}</span>
        </div>
        <div v-if="op.lines.length > 0" class="diff-lines">
          <div
            v-for="(line, li) in op.lines.slice(0, 15)"
            :key="li"
            class="diff-line"
            :class="line.sign === '+' ? 'add' : line.sign === '-' ? 'del' : 'ctx'"
          >
            <span class="marker">{{ line.sign || ' ' }}</span>
            <span class="text">{{ line.text || ' ' }}</span>
          </div>
          <div v-if="op.lines.length > 15" class="more-hint">
            … 共 {{ op.lines.length }} 行
          </div>
        </div>
      </div>
    </div>

    <!-- update: diff 预览 -->
    <div v-else-if="!isPatchMode && editType === 'update' && ops.length > 0" class="diff-preview">
      <div v-for="(op, i) in ops" :key="i" class="diff-op">
        <div class="op-header">
          <span v-if="op.kind === 'replace'" class="op-tag replace">替换 {{ op.start }}-{{ op.end }}</span>
          <span v-else-if="op.kind === 'delete'" class="op-tag delete">删除 {{ op.start }}-{{ op.end }}</span>
          <span v-else-if="op.kind === 'insert'" class="op-tag insert">插入 ({{ op.position }}{{ typeof op.anchor === 'number' ? ' ' + op.anchor : '' }})</span>
        </div>
        <div v-if="op.kind !== 'delete'" class="diff-lines">
          <div v-for="(text, li) in op.adds" :key="li" class="diff-line add">
            <span class="marker">+</span>
            <span class="text">{{ text || ' ' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- add: 新文件内容预览 -->
    <div v-else-if="!isPatchMode && editType === 'add' && addPreviewLines.length > 0" class="add-preview">
      <div v-for="(text, i) in addPreviewLines" :key="i" class="diff-line add">
        <span class="marker">+</span>
        <span class="text">{{ text || ' ' }}</span>
      </div>
      <div v-if="content.split('\n').length > 10" class="more-hint">
        … 共 {{ content.split('\n').length }} 行
      </div>
    </div>

    <!-- delete / move: 仅路径 -->
    <div v-else-if="!isPatchMode && editType === 'delete'" class="plain-info">删除文件</div>
    <div v-else-if="!isPatchMode && editType === 'move'" class="plain-info">移动 / 重命名文件</div>

    <!-- 结果 -->
    <div v-if="hasError" class="result-section error">
      <div class="result-icon">✕</div>
      <div class="result-text">{{ truncate(errorMsg, 1000) }}</div>
    </div>
    <div v-else-if="summary" class="result-section success">
      <div class="result-icon">✓</div>
      <div class="result-text">{{ truncate(summary, 1000) }}</div>
    </div>
  </div>
</template>

<style scoped>
.edit-file-render {
  display: flex;
  flex-direction: column;
}

.diff-preview,
.add-preview,
.patch-preview {
  padding: 4px 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 10px;
  line-height: 1.5;
}

.patch-file {
  padding: 0 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.patch-file:last-child {
  border-bottom: none;
}

.patch-file-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  flex-wrap: wrap;
}

.patch-op-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
}

.patch-op-tag.add {
  color: var(--color-success);
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.1);
}

.patch-op-tag.delete {
  color: var(--color-error);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.1);
}

.patch-op-tag.update {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.patch-file-path {
  color: var(--text-primary);
  font-weight: 500;
}

.patch-move {
  color: var(--text-tertiary);
}

.diff-op {
  padding: 0 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.diff-op:last-child {
  border-bottom: none;
}

.op-header {
  padding: 2px 0;
}

.op-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
}

.op-tag.replace {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.op-tag.delete {
  color: var(--color-error);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.1);
}

.op-tag.insert {
  color: var(--color-success);
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.1);
}

.diff-line {
  display: flex;
  gap: 4px;
  white-space: pre;
}

.diff-line.add {
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.08);
}

.diff-line.del {
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.08);
}

.diff-line.ctx {
  color: var(--text-tertiary);
}

.diff-line.del .marker {
  color: var(--color-error);
}

.marker {
  flex: none;
  width: 12px;
  text-align: center;
  color: var(--color-success);
  user-select: none;
}

.text {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.more-hint {
  padding: 2px 12px;
  font-size: 9px;
  color: var(--text-tertiary);
  font-style: italic;
}

.plain-info {
  padding: 6px 8px;
  font-size: 10px;
  color: var(--text-secondary);
}

.result-section {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 8px;
  font-size: 10px;
  border-top: 1px solid var(--border-color-light);
}

.result-section.success {
  color: var(--color-success);
}

.result-section.error {
  color: var(--color-error);
}

.result-icon {
  flex: none;
  font-weight: 700;
}

.result-text {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}
</style>
