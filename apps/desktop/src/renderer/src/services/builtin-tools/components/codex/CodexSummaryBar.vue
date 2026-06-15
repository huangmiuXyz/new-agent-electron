<script setup lang="ts">
import { canOpenInCanvas, copyText, openInCanvas, toDisplayPath } from './codexUtils'

// 展开内容顶部的统一信息条：路径/命令 + 可选徽标 + 在 canvas 打开 + 复制
const props = defineProps<{
  /** 主文本，通常是文件路径或命令 */
  text: string
  /** 原始路径（用于打开 canvas），不传则隐藏打开按钮 */
  path?: string
  /** 右侧徽标，如行范围 "1-160" */
  badge?: string
  /** message 引用，用于解析 chatId */
  message?: any
  /** 是否是命令行展示（影响字体/换行） */
  mono?: boolean
}>()

const copied = ref(false)

const openable = computed(() => (props.path ? canOpenInCanvas(props.path, props.message) : false))

const handleOpen = () => {
  if (!props.path) return
  const ok = openInCanvas(props.path, props.message)
  if (!ok) messageApi.warning('该文件不在当前 Canvas 工作区内，无法打开')
}

const handleCopy = async (e: Event) => {
  e.stopPropagation()
  const ok = await copyText(props.text)
  if (ok) {
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  }
}
</script>

<template>
  <div class="codex-summary-bar">
    <div class="bar-main" :class="{ clickable: openable, mono }" :title="openable ? '在 Canvas 中打开' : ''" @click="openable ? handleOpen() : null">
      <span class="bar-text">{{ toDisplayPath(text) }}</span>
      <span v-if="badge" class="bar-badge">{{ badge }}</span>
    </div>
    <div class="bar-actions" @click.stop>
      <button
        v-if="path"
        class="bar-btn"
        :class="{ disabled: !openable }"
        :title="openable ? '在 Canvas 中打开' : '不在当前 Canvas 工作区'"
        :disabled="!openable"
        @click="handleOpen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </button>
      <button class="bar-btn" :title="copied ? '已复制' : '复制'" @click="handleCopy">
        <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.codex-summary-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid var(--border-color-light);
}

.bar-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  font-size: 11px;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  word-break: break-all;
}

.bar-main.mono {
  white-space: pre-wrap;
}

.bar-main.clickable {
  cursor: pointer;
}

.bar-main.clickable:hover .bar-text {
  color: var(--accent-color);
  text-decoration: underline;
}

.bar-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-badge {
  flex: none;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-radius: 3px;
  padding: 1px 4px;
  text-transform: none;
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.bar-btn:hover:not(.disabled):not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.bar-btn:disabled,
.bar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
