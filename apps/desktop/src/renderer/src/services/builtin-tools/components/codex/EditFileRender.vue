<script setup lang="ts">
import CodexSummaryBar from './CodexSummaryBar.vue'
import { extractResultError, extractResultSummary, truncate } from './codexUtils'
import { useChatsStores } from '@renderer/stores/chats'

type EditOp =
  | { kind: 'replace'; start: number; end: number; adds: string[] }
  | { kind: 'delete'; start: number; end: number }
  | { kind: 'insert'; anchor: number | 'head' | 'tail'; position: string; adds: string[] }

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const chatsStore = useChatsStores()
const reverting = ref(false)
const reverted = ref(false)

const editType = computed(() => {
  const t = String(props.args?.type || 'update')
  return ['update', 'add', 'delete', 'move', 'replace'].includes(t) ? t : 'update'
})
const path = computed(() => String(props.args?.path || ''))
const newPath = computed(() => String(props.args?.new_path || ''))
const content = computed(() => String(props.args?.content || ''))
const oldString = computed(() => String(props.args?.old_string || ''))
const newString = computed(() => String(props.args?.new_string || ''))

const summary = computed(() => extractResultSummary(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

const isReplaceMode = computed(() => editType.value === 'replace' || !!oldString.value)

const headerPath = computed(() => {
  const m = content.value.match(/^¶(.+?)#/m)
  return m ? m[1] : ''
})
const displayPath = computed(() => headerPath.value || path.value)

const addText = computed(() => {
  if (editType.value !== 'add') return ''
  return content.value || newString.value
})
const addPreviewLines = computed(() => {
  if (editType.value !== 'add') return []
  return addText.value.replace(/\r\n/g, '\n').split('\n').slice(0, 10)
})

const replacementLines = computed(() => {
  if (!isReplaceMode.value) return []
  const removed = oldString.value.replace(/\r\n/g, '\n').split('\n')
  const added = newString.value.replace(/\r\n/g, '\n').split('\n')
  return [
    ...removed.map((text) => ({ sign: '-' as const, text })),
    ...added.map((text) => ({ sign: '+' as const, text }))
  ]
})

const ops = computed<EditOp[]>(() => {
  if (editType.value !== 'update' || !content.value) return []
  const lines = content.value.replace(/\r\n/g, '\n').split('\n')
  const result: EditOp[] = []
  let i = 0

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

const canRevert = computed(() => {
  if (reverted.value || reverting.value) return false
  if (hasError.value) return false
  return !!props.result?._snapshot
})

const collectSubsequentPatches = () => {
  const chatId = props.message?.metadata?.cid
  if (!chatId) return { patches: [], chatId: '' }

  const msgId = props.message?.id
  if (!msgId) return { patches: [], chatId }

  const chat = chatsStore.allChats.find((c: any) => c.id === chatId)
  if (!chat) return { patches: [], chatId }

  const msgs = chat.messages || []
  const currentIdx = msgs.findIndex((m: any) => m.id === msgId)
  if (currentIdx < 0) return { patches: [], chatId }

  const patches: Array<{ hash: string; files: string[] }> = []

  for (let i = currentIdx + 1; i < msgs.length; i++) {
    const msg = msgs[i]
    const parts = msg.parts || []
    for (const part of parts) {
      if (part.output?._snapshot?.hash && part.output?._snapshot?.files?.length) {
        patches.push({
          hash: part.output._snapshot.hash,
          files: part.output._snapshot.files
        })
      }
    }
  }

  return { patches, chatId }
}

const handleRevert = async () => {
  if (reverting.value || reverted.value) return

  const snapshot = props.result?._snapshot
  if (!snapshot?.baseDir) return

  const { patches, chatId } = collectSubsequentPatches()
  const allPatches = [snapshot, ...patches].filter(
    (p: any) => p?.hash && p?.files?.length
  )
  if (!allPatches.length) return

  reverting.value = true
  try {
    const serialized = JSON.stringify({
      baseDir: snapshot.baseDir,
      patches: allPatches.map((p: any) => ({
        hash: p.hash,
        files: p.files
      }))
    })
    const res = await window.api.snapshot.revert(serialized)

    if (!res.ok) {
      console.error('revert failed:', res.error)
      return
    }

    reverted.value = true

    if (chatId) {
      const msgId = props.message?.id
      const chat = chatsStore.allChats.find((c: any) => c.id === chatId)
      if (chat) {
        const msgs = chat.messages || []
        const currentIdx = msgs.findIndex((m: any) => m.id === msgId)
        if (currentIdx >= 0) {
          const toRemove = msgs.slice(currentIdx + 1)
          for (const rm of toRemove) {
            chatsStore.deleteMessage(chatId, rm.id)
          }
        }
      }
    }
  } catch (e) {
    console.error('revert error:', e)
  } finally {
    reverting.value = false
  }
}
</script>

<template>
  <div class="edit-file-render">
    <CodexSummaryBar
      v-if="!isReplaceMode"
      :text="editType === 'move' ? `${displayPath} → ${newPath}` : displayPath"
      :path="editType === 'move' ? newPath : displayPath"
      :badge="editType !== 'update' ? editType : `${totalChanges}处改动`"
      :message="message"
    />
    <CodexSummaryBar
      v-else
      :text="path"
      :path="path"
      badge="精确替换"
      :message="message"
    />

    <div v-if="isReplaceMode && replacementLines.length > 0" class="diff-preview">
      <div class="diff-lines">
        <div
          v-for="(line, li) in replacementLines.slice(0, 20)"
          :key="li"
          class="diff-line"
          :class="line.sign === '+' ? 'add' : 'del'"
        >
          <span class="marker">{{ line.sign }}</span>
          <span class="text">{{ line.text || ' ' }}</span>
        </div>
        <div v-if="replacementLines.length > 20" class="more-hint">
          … 共 {{ replacementLines.length }} 行
        </div>
      </div>
    </div>

    <div v-else-if="editType === 'update' && ops.length > 0" class="diff-preview">
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

    <div v-else-if="editType === 'add' && addPreviewLines.length > 0" class="add-preview">
      <div v-for="(text, i) in addPreviewLines" :key="i" class="diff-line add">
        <span class="marker">+</span>
        <span class="text">{{ text || ' ' }}</span>
      </div>
      <div v-if="addText.split('\n').length > 10" class="more-hint">
        … 共 {{ addText.split('\n').length }} 行
      </div>
    </div>

    <div v-else-if="editType === 'delete'" class="plain-info">删除文件</div>
    <div v-else-if="editType === 'move'" class="plain-info">移动 / 重命名文件</div>

    <div v-if="hasError" class="result-section error">
      <div class="result-icon">×</div>
      <div class="result-text">{{ truncate(errorMsg, 1000) }}</div>
    </div>
    <div v-else-if="summary" class="result-section success">
      <div class="result-icon">✓</div>
      <div class="result-text">{{ truncate(summary, 1000) }}</div>
      <button
        v-if="canRevert"
        class="revert-btn"
        :class="{ loading: reverting }"
        :disabled="reverting"
        @click="handleRevert"
      >
        {{ reverted ? '已恢复' : '恢复' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.edit-file-render {
  display: flex;
  flex-direction: column;
}

.diff-preview,
.add-preview {
  padding: 4px 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 10px;
  line-height: 1.5;
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

.revert-btn {
  flex: none;
  margin-left: auto;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 8px;
  border: 1px solid var(--color-warning);
  border-radius: 4px;
  background: transparent;
  color: var(--color-warning);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.revert-btn:hover:not(:disabled) {
  background: rgba(var(--color-warning-rgb, 234, 179, 8), 0.12);
}

.revert-btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.revert-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
