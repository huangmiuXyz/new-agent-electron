<script setup lang="ts">
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import { CODE_THEME_PAIRS } from '@renderer/utils/codeThemes'

const settingsStore = useSettingsStore()

const lowlight = createLowlight(common)

const previewCode = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

const result = fibonacci(10)
console.log(\`Result: \${result}\`)`

const previewHtml = computed(() => {
  try {
    const tree = lowlight.highlight('typescript', previewCode)
    const html = toHtml(tree)
    return `<code class="hljs language-typescript">${html}</code>`
  } catch {
    return `<code class="hljs"><pre>${previewCode}</pre></code>`
  }
})

function selectTheme(id: string) {
  settingsStore.updateDisplaySettings({ codeTheme: id })
}
</script>

<template>
  <div class="code-theme-config">
    <div class="config-header">
      <span class="config-title">代码主题</span>
      <span class="config-hint">选择聊天代码块的语法高亮主题</span>
    </div>

    <div class="theme-grid">
      <button
        v-for="theme in CODE_THEME_PAIRS"
        :key="theme.id"
        class="theme-card"
        :class="{ active: settingsStore.display.codeTheme === theme.id }"
        @click="selectTheme(theme.id)"
      >
        <div class="theme-indicator">
          <div class="indicator-bar light-bar" />
          <div class="indicator-bar dark-bar" />
        </div>
        <div class="theme-name">{{ theme.name }}</div>
      </button>
    </div>

    <div class="preview-section">
      <div class="preview-label">实时预览</div>
      <div class="preview-box">
        <div class="preview-header-bar">
          <span class="preview-lang">TypeScript</span>
        </div>
        <pre class="preview-code" v-html="previewHtml" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-theme-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.config-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.config-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.theme-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-secondary-soft);
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 80px;
}

.theme-card:hover {
  border-color: var(--color-primary);
  background: var(--bg-hover);
}

.theme-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.theme-indicator {
  display: flex;
  gap: 3px;
  border-radius: 4px;
  overflow: hidden;
  width: 48px;
  height: 20px;
}

.indicator-bar {
  flex: 1;
  border-radius: 2px;
}

.light-bar {
  background: #ffffff;
  border: 1px solid #d0d7de;
}

.dark-bar {
  background: #0d1117;
  border: 1px solid #30363d;
}

.theme-card:nth-child(2) .light-bar { background: #fafafa; border-color: #e0e0e0; }
.theme-card:nth-child(2) .dark-bar { background: #282c34; border-color: #3e4451; }

.theme-card:nth-child(3) .light-bar { background: #f6f6f6; border-color: #dcdcdc; }
.theme-card:nth-child(3) .dark-bar { background: #1c1b1b; border-color: #3a3a3a; }

.theme-card:nth-child(4) .light-bar { background: #fffffe; border-color: #d4d4d4; }
.theme-card:nth-child(4) .dark-bar { background: #1e1e1e; border-color: #3c3c3c; }

.theme-card:nth-child(5) .light-bar { background: #f5f6fb; border-color: #d5d7e0; }
.theme-card:nth-child(5) .dark-bar { background: #1a1b26; border-color: #363b54; }

.theme-card:nth-child(6) .light-bar { background: #f6f8fa; border-color: #d1d5db; }
.theme-card:nth-child(6) .dark-bar { background: #2e3440; border-color: #4c566a; }

.theme-card:nth-child(7) .light-bar { background: #faf4ed; border-color: #e0d6cc; }
.theme-card:nth-child(7) .dark-bar { background: #191724; border-color: #3e334a; }

.theme-card:nth-child(8) .light-bar { background: #fefefe; border-color: #e0e0e0; }
.theme-card:nth-child(8) .dark-bar { background: #272822; border-color: #3e3d32; }

.theme-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.theme-card.active .theme-name {
  color: var(--color-primary);
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.preview-box {
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 8px;
  overflow: hidden;
}

:root:not(.dark-mode) .preview-box {
  --border-color: #e1e4e8;
}

.dark-mode .preview-box {
  --border-color: #30363d;
}

.preview-header-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 4px 12px;
  background: var(--bg-secondary-soft);
  border-bottom: 1px solid var(--border-color);
}

.preview-lang {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.preview-code {
  margin: 0;
  padding: 12px 16px;
  overflow-x: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-card);
  white-space: pre-wrap;
  word-break: break-all;
}

.preview-code :deep(.hljs) {
  background: transparent !important;
}
</style>
