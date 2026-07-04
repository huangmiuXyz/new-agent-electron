<script setup lang="ts">
import CodexSummaryBar from './CodexSummaryBar.vue'
import {
  extractResultError,
  extractResultText,
  openInCanvas,
  toDisplayPath,
  truncate
} from './codexUtils'
import { getFileIcon, getFileIconByName } from '@renderer/utils/fileIcons'

type DirEntry = {
  name: string
  path: string
  isDir: boolean
  depth: number
}

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const dirPath = computed(() => String(props.args?.path || ''))
const resultText = computed(() => extractResultText(props.result))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)

// 从输出中提取目录根路径 "Directory listing for X:" 后的列表行
const entries = computed<DirEntry[]>(() => {
  const text = resultText.value
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let started = false
  const root = dirPath.value || '.'
  const out: DirEntry[] = []

  for (const line of lines) {
    if (!started) {
      if (line.startsWith('Directory listing for')) {
        started = true
      }
      continue
    }
    // 行格式：`(缩进)(d |- )name`
    const m = line.match(/^(\s*)([d-])\s+(.+)$/)
    if (!m) {
      if (line.includes('output truncated')) continue
      // 非法行跳过
      continue
    }
    const indent = m[1].length
    const depth = Math.floor(indent / 2)
    const isDir = m[2] === 'd'
    const name = m[3]
    // 构造相对路径（粗略：用 depth 拼接；精确层级需要栈，这里简化展示）
    out.push({ name, path: name, isDir, depth })
  }

  // 标记根，方便点击时拼路径
  void root
  return out
})

const handleOpen = (entry: DirEntry) => {
  if (entry.isDir) return
  // 用 name 作为相对路径尝试打开
  const ok = openInCanvas(entry.path, props.message)
  if (!ok) messageApi.warning('该文件不在当前 Canvas 工作区内，无法打开')
}

// 头部目录图标
const dirHeaderIcon = getFileIconByName('folder').vnode

// 按条目名缓存图标 VNode
const entryIconMap = computed(() => {
  const map = new Map<string, any>()
  for (const e of entries.value) {
    map.set(e.name, e.isDir ? getFileIconByName('folder').vnode : getFileIcon(e.name).vnode)
  }
  return map
})
</script>

<template>
  <div class="list-dir-render">
    <CodexSummaryBar :text="dirPath" :path="dirPath" :badge="`${entries.length}项`" :icon="dirHeaderIcon" :message="message" />

    <div v-if="hasError" class="error-box">{{ errorMsg }}</div>

    <div v-else-if="entries.length > 0" class="entry-list">
      <div
        v-for="(e, i) in entries"
        :key="i"
        class="entry"
        :class="{ dir: e.isDir, file: !e.isDir, clickable: !e.isDir }"
        :style="{ paddingLeft: `${8 + e.depth * 12}px` }"
        @click="!e.isDir ? handleOpen(e) : null"
      >
        <span class="entry-icon"><component :is="entryIconMap.get(e.name)" /></span>
        <span class="entry-name">{{ toDisplayPath(e.name) }}</span>
      </div>
    </div>

    <div v-else-if="resultText" class="raw-output">{{ truncate(resultText, 4000) }}</div>

    <div v-else class="empty-hint">目录为空或无输出</div>
  </div>
</template>

<style scoped>
.list-dir-render {
  display: flex;
  flex-direction: column;
}

.error-box {
  padding: 6px 8px;
  color: var(--color-error);
  font-size: 11px;
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.06);
}

.entry-list {
  padding: 4px 0;
  max-height: 320px;
  overflow-y: auto;
}

.entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  font-size: 10px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--text-primary);
}

.entry.clickable {
  cursor: pointer;
}

.entry.clickable:hover {
  background: var(--bg-hover);
}

.entry.clickable:hover .entry-name {
  color: var(--accent-color);
  text-decoration: underline;
}

.entry-icon {
  flex: none;
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

.entry-icon :deep(img) {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.entry-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry.dir .entry-name {
  color: var(--text-secondary);
  font-weight: 500;
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

.entry-list::-webkit-scrollbar,
.raw-output::-webkit-scrollbar {
  width: 6px;
}

.entry-list::-webkit-scrollbar-thumb,
.raw-output::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}
</style>
