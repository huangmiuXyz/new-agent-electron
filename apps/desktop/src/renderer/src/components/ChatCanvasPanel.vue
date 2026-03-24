<script setup lang="ts">
import HtmlPreview from './HtmlPreview.vue'
import Tabs from './Tabs.vue'
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import 'highlight.js/styles/github.css'
import 'highlight.js/styles/atom-one-dark.css'

const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()
const canvasStore = useCanvasStore()
const lowlight = createLowlight(common)
const message = messageApi
const { Download: DownloadIcon } = useIcon(['Download'])

const canvasTabs = [
  { id: 'preview', name: '预览' },
  { id: 'code', name: '代码' }
]

const currentChatId = computed(() => chatsStore.currentChat?.id)

const canvasHtml = computed({
  get: () => canvasStore.getCanvasHtml(currentChatId.value),
  set: (value: string) => canvasStore.setCanvasHtml(value, currentChatId.value)
})

const currentCanvas = computed(() => canvasStore.getCanvas(currentChatId.value))

const updatedAtText = computed(() => {
  const updatedAt = currentCanvas.value?.updatedAt
  if (!updatedAt) return '未创建'
  return new Date(updatedAt).toLocaleString()
})

const previewHtml = computed(() => {
  if (canvasHtml.value.trim()) return canvasHtml.value

  return `
    <html>
      <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fb;color:#6b7280;font-family:system-ui,sans-serif;">
        <div style="max-width:260px;text-align:center;line-height:1.7;padding:24px;">
          画布内容为空。<br />
          你可以直接在代码页输入 HTML，或让 AI 通过内置工具写入画布。
        </div>
      </body>
    </html>
  `
})

const clearCanvas = () => {
  canvasStore.clearCanvas(currentChatId.value)
}

const downloadCanvas = () => {
  const html = canvasHtml.value.trim()

  if (!html) {
    message.warning('当前画布为空，暂无可下载内容')
    return
  }

  try {
    const blob = new Blob([canvasHtml.value], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().replaceAll(':', '-').slice(0, 19)

    link.href = url
    link.download = `canvas-${date}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success('HTML 画布已开始下载')
  } catch (error) {
    console.error('Canvas download error:', error)
    message.error('下载 HTML 画布失败')
  }
}

const highlightedCode = computed(() => {
  const html = canvasHtml.value || ''

  if (!html) {
    return '<code class="hljs language-html"></code>'
  }

  try {
    return `<code class="hljs language-html">${toHtml(lowlight.highlight('html', html))}</code>`
  } catch (error) {
    console.error('Canvas highlight error:', error)
    return `<code class="hljs language-html">${html
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')}</code>`
  }
})

const codeEditorRef = useTemplateRef('codeEditorRef')
const codeHighlightRef = useTemplateRef('codeHighlightRef')

const syncCodeScroll = () => {
  const editor = codeEditorRef.value
  const highlight = codeHighlightRef.value
  if (!editor || !highlight) return
  highlight.scrollTop = editor.scrollTop
  highlight.scrollLeft = editor.scrollLeft
}
</script>

<template>
  <div class="canvas-panel">
    <div class="canvas-panel-header">
      <div class="canvas-panel-meta">
        <strong>HTML 画布</strong>
        <span>最后更新：{{ updatedAtText }}</span>
      </div>
      <div class="canvas-panel-actions">
        <Button size="sm" variant="secondary" @click="downloadCanvas">
          <template #icon>
            <DownloadIcon />
          </template>
          下载
        </Button>
        <Button size="sm" @click="clearCanvas">清空</Button>
      </div>
    </div>

    <div class="canvas-tabs">
      <Tabs v-model="settingsStore.display.canvasEditorTab" :items="canvasTabs" size="sm" />
    </div>

    <div v-show="settingsStore.display.canvasEditorTab === 'preview'" class="canvas-preview">
      <HtmlPreview :html="previewHtml" />
    </div>

    <div v-show="settingsStore.display.canvasEditorTab === 'code'" class="canvas-code">
      <div class="canvas-code-editor">
        <pre ref="codeHighlightRef" class="canvas-code-highlight" v-html="highlightedCode"></pre>
        <textarea
          ref="codeEditorRef"
          v-model="canvasHtml"
          class="canvas-code-input"
          rows="20"
          spellcheck="false"
          placeholder="在这里输入 HTML，AI 也可以通过内置工具读写这里的内容。"
          @scroll="syncCodeScroll"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.canvas-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 8px;
}

.canvas-panel-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.canvas-panel-meta strong {
  font-size: 13px;
  color: var(--text-primary);
}

.canvas-panel-meta span {
  font-size: 12px;
  color: var(--text-tertiary);
}

.canvas-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.canvas-tabs {
  padding: 0 16px 12px;
}

.canvas-preview,
.canvas-code {
  flex: 1;
  min-height: 0;
  padding: 0 16px 16px;
}

.canvas-preview :deep(.preview-wrapper),
.canvas-preview :deep(iframe) {
  height: 100%;
  border-radius: 10px;
  background: var(--bg-card);
}

.canvas-code-input {
  height: 100%;
  font-family: Menlo, Monaco, "Courier New", monospace;
  line-height: 1.6;
  resize: none;
}

.canvas-code-editor {
  position: relative;
  height: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-input);
}

.canvas-code-highlight,
.canvas-code-input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  overflow: auto;
}

.canvas-code-highlight {
  pointer-events: none;
  z-index: 1;
}

.canvas-code-input {
  z-index: 2;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text-primary);
}

.canvas-code-input::selection {
  background: rgba(59, 130, 246, 0.22);
}

.canvas-code-input::placeholder {
  color: var(--text-placeholder);
}

.canvas-code-highlight :deep(code),
.canvas-code-highlight :deep(.hljs) {
  display: block;
  min-height: 100%;
  background: transparent;
  color: inherit;
  font-family: inherit;
}

:global(.dark) .canvas-code-highlight :deep(.hljs) {
  background: #0d1117;
}

:global(.light) .canvas-code-highlight :deep(.hljs) {
  background: #ffffff;
}
</style>
