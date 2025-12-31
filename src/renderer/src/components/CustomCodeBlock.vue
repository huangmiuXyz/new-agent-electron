<template>
    <div class="code-block" :class="display.darkMode ? 'dark' : 'light'">
        <div class="header">
            <span class="language">{{ lang }}</span>
            <div class="actions">
                <button v-if="isHtml" class="preview-btn" @click="showPreviewModal">
                    预览
                </button>
                <button class="copy-btn" @click="copy">
                    {{ copied ? '✓' : '复制' }}
                </button>
            </div>
        </div>

        <pre class="code-content" v-html="highlightedCode"></pre>
    </div>
</template>

<script setup lang="ts">
import { h, computed, ref } from 'vue'
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import { useSettingsStore } from '@renderer/stores/settings'
import HtmlPreview from './HtmlPreview.vue'
import 'highlight.js/styles/github.css'
import 'highlight.js/styles/atom-one-dark.css'

const lowlight = createLowlight(common)
const { display } = storeToRefs(useSettingsStore())
const { confirm } = useModal()

const props = defineProps<{
    codeStr: string
    lang?: string
}>()

const copied = ref(false)

const lang = computed(() => props.lang || 'text')
const lowerLang = computed(() => lang.value.toLowerCase())
const isHtml = computed(
    () => lowerLang.value === 'html' || lowerLang.value === 'htm'
)

const highlightedCode = computed(() => {
    try {
        const tree = lowlight.highlight(lowerLang.value, props.codeStr)
        const html = toHtml(tree)
        return `<code class="hljs language-${lang.value}">${html}</code>`
    } catch {
        return `<code class="hljs">${props.codeStr
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</code>`
    }
})

async function showPreviewModal() {
    await confirm({
        title: 'HTML 预览',
        content: h(HtmlPreview, { html: props.codeStr }),
        width: '90%',
        height: '90vh',
        confirmText: '关闭',
        showFooter: true
    })
}

async function copy() {
    if (!props.codeStr) return
    await navigator.clipboard.writeText(props.codeStr)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
}
</script>

<style scoped>
.code-block {
    margin: 16px 0;
    border-radius: 8px;
    overflow: visible;
    border: 1px solid var(--border-color, #e1e4e8);
    position: relative;
}

.code-block.dark {
    --border-color: #30363d;
    --header-bg: #161b22;
    --language-color: #8b949e;
    --button-border: #30363d;
    --button-bg: #21262d;
    --button-color: #c9d1d9;
    --button-hover-bg: #30363d;
    --button-hover-border: #484f58;
    --code-bg: #0d1117;
}

.code-block.light {
    --border-color: #e1e4e8;
    --header-bg: #f6f8fa;
    --language-color: #586069;
    --button-border: #d1d5da;
    --button-bg: #ffffff;
    --button-color: #24292e;
    --button-hover-bg: #f3f4f6;
    --button-hover-border: #c0c4cc;
    --code-bg: #fff;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
    z-index: 10;
}

.language {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--language-color);
}

.actions {
    display: flex;
    gap: 8px;
}

.preview-btn,
.copy-btn {
    padding: 4px 12px;
    font-size: 12px;
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--button-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.preview-btn:hover,
.copy-btn:hover {
    background: var(--button-hover-bg);
    border-color: var(--button-hover-border);
}

.code-content {
    margin: 0;
    overflow-x: auto;
    background: var(--code-bg);
    border-radius: 0 0 8px 8px;
}

.code-content code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
}

/* 亮色主题：使用 github.css 样式 */
.code-block.light :deep(.hljs) {
    background: transparent !important;
}

/* 暗色主题：使用 atom-one-dark.css 样式 */
.code-block.dark :deep(.hljs) {
    background: transparent !important;
}
</style>
