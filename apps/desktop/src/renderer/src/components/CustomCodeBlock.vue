<template>
    <div ref="codeBlockRef" class="code-block" :class="display.darkMode ? 'dark' : 'light'">
        <div ref="sentinelRef" class="sentinel"></div>
        <div class="header" :class="{ 'is-stuck': isStuck }">
            <span class="language">{{ lang }}</span>
            <div class="actions">
                <button v-if="isHtml" class="browser-btn" @click="openInBrowser" title="在浏览器中打开">
                    <Globe />
                </button>
                <button v-if="isHtml" class="preview-btn" @click="showPreviewModal">
                    预览
                </button>
                <button
                    v-if="isLongCode"
                    class="expand-btn"
                    type="button"
                    @click="toggleExpanded"
                    :title="isExpanded ? '收起长代码' : longCodeTitle"
                >
                    {{ isExpanded ? '收起' : '展开' }}
                </button>
                <button class="copy-btn" @click="copy">
                    {{ copied ? '✓' : '复制' }}
                </button>
            </div>
        </div>

        <pre
            v-if="useHighlightedHtml"
            class="code-content"
            :class="{ 'has-expand-overlay': isLongCode && !isExpanded }"
            v-html="highlightedCode"
        ></pre>
        <pre
            v-else
            class="code-content"
            :class="{ 'has-expand-overlay': isLongCode && !isExpanded }"
        >
            <code class="hljs" :class="`language-${lang}`" v-text="plainCode"></code>
        </pre>
        <button
            v-if="isLongCode && !isExpanded"
            class="code-expand-overlay"
            type="button"
            @click="toggleExpanded"
            :title="longCodeTitle"
        >
            {{ longCodeTitle }}
        </button>
    </div>
</template>

<script setup lang="ts">
import { h, computed, inject, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import { useSettingsStore } from '@renderer/stores/settings'
import HtmlPreview from './HtmlPreview.vue'
import { useIcon } from '@renderer/composables/useIcon'
import { CUSTOM_CODE_BLOCK_COMPLETED_KEY } from './customCodeBlockCompletion'
const lowlight = createLowlight(common)
const { display } = storeToRefs(useSettingsStore())
const { confirm } = useModal()
const Globe = useIcon('Globe')

const props = defineProps<{
    codeStr: string
    lang?: string
    completed?: boolean
    takeOver?: boolean
}>()

const copied = ref(false)
const isStuck = ref(false)
const codeBlockRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
let sentinelObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!sentinelRef.value) return
  sentinelObserver = new IntersectionObserver(
    ([entry]) => {
      isStuck.value = !entry.isIntersecting
    },
    { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
  )
  sentinelObserver.observe(sentinelRef.value)
})

onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  sentinelObserver = null
})

const lang = computed(() => props.lang || 'text')
const lowerLang = computed(() => lang.value.toLowerCase())
const injectedCompleted = inject(CUSTOM_CODE_BLOCK_COMPLETED_KEY, undefined)
const isCompleted = computed(() => {
    if (typeof props.completed === 'boolean') {
        return props.completed
    }
    if (injectedCompleted) {
        return injectedCompleted.value
    }
    return true
})
const isHtml = computed(
    () => lowerLang.value === 'html' || lowerLang.value === 'htm'
)

const HIGHLIGHT_MAX_LENGTH = 30000
const PREVIEW_MAX_LENGTH = 20000
const PREVIEW_MAX_LINES = 240

const highlightedCode = ref('')
const plainCode = ref('')
const useHighlightedHtml = ref(false)
const isExpanded = ref(false)

let highlightTimer: ReturnType<typeof setTimeout> | null = null
let idleCallbackId: number | null = null
let renderVersion = 0

const getPreviewEndIndex = (code: string) => {
    if (!code) return 0

    let lines = 1
    const maxIndex = Math.min(code.length, PREVIEW_MAX_LENGTH)
    for (let index = 0; index < maxIndex; index += 1) {
        if (code.charCodeAt(index) === 10) {
            lines += 1
            if (lines > PREVIEW_MAX_LINES) {
                return index
            }
        }
    }

    return maxIndex
}

const previewEndIndex = computed(() => getPreviewEndIndex(props.codeStr || ''))
const isLongCode = computed(() => previewEndIndex.value < (props.codeStr || '').length)
const renderCode = computed(() => {
    const code = props.codeStr || ''
    return isLongCode.value && !isExpanded.value ? code.slice(0, previewEndIndex.value) : code
})
const longCodeTitle = computed(() => {
    const hiddenChars = Math.max(0, (props.codeStr || '').length - previewEndIndex.value)
    return `展开完整代码，剩余 ${hiddenChars.toLocaleString()} 字符`
})

const toggleExpanded = () => {
    isExpanded.value = !isExpanded.value
}

function setPlainCode(code: string) {
    plainCode.value = code
    useHighlightedHtml.value = false
}

function clearHighlightTasks() {
    if (highlightTimer) {
        clearTimeout(highlightTimer)
        highlightTimer = null
    }
    if (idleCallbackId !== null) {
        cancelIdleCallback(idleCallbackId)
        idleCallbackId = null
    }
}

function runHighlight(version: number) {
    if (version !== renderVersion) {
        return
    }

    const code = renderCode.value
    if (!code || code.length > HIGHLIGHT_MAX_LENGTH) {
        setPlainCode(code || '')
        return
    }

    try {
        const tree = lowlight.highlight(lowerLang.value, code)
        const html = toHtml(tree)
        highlightedCode.value = `<code class="hljs language-${lang.value}">${html}</code>`
        useHighlightedHtml.value = true
    } catch (e) {
        console.error('Highlight error:', e)
        setPlainCode(code)
    }
}

function scheduleHighlight() {
    clearHighlightTasks()
    renderVersion += 1
    const currentVersion = renderVersion
    const code = renderCode.value

    // Keep streaming lightweight; only upgrade to highlighted HTML after completion.
    setPlainCode(code)

    if (!isCompleted.value || !code || code.length > HIGHLIGHT_MAX_LENGTH) {
        return
    }

    const run = () => {
        if (typeof requestIdleCallback === 'function') {
            idleCallbackId = requestIdleCallback(() => {
                idleCallbackId = null
                runHighlight(currentVersion)
            })
            return
        }

        runHighlight(currentVersion)
    }
    run()
}

watch([renderCode, () => lowerLang.value, () => isCompleted.value], () => {
    scheduleHighlight()
}, { immediate: true })

watch(
    () => props.codeStr,
    () => {
        isExpanded.value = false
    }
)

onBeforeUnmount(() => {
    clearHighlightTasks()
})

async function showPreviewModal() {
    await confirm({
        title: 'HTML 预览',
        content: h(HtmlPreview, { html: props.codeStr }),
        width: '90%',
        height: '90vh',
        confirmText: '关闭',
        modalBodyStyle: {
            padding: 0
        },
        showFooter: true
    })
}

async function openInBrowser() {
    if (!props.codeStr) return
    const htmlContent = props.codeStr
    const tempDir = window.api.getPath('temp')
    const fileName = `temp-${Date.now()}.html`
    const filePath = window.api.path.join(tempDir, fileName)
    window.api.fs.writeFileSync(filePath, htmlContent, 'utf-8')
    await window.api.shell.openPath(filePath)
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

.sentinel {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    pointer-events: none;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: var(--header-bg);
    border-radius: 8px;
    position: sticky;
    top: 0;
    z-index: 10;
}

.header.is-stuck {
    border-radius: 0;
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

.browser-btn {
    padding: 4px 8px;
    font-size: 12px;
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--button-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.browser-btn svg {
    width: 14px;
    height: 14px;
}

.preview-btn,
.expand-btn,
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
.expand-btn:hover,
.copy-btn:hover,
.browser-btn:hover {
    background: var(--button-hover-bg);
    border-color: var(--button-hover-border);
}

.code-content {
    margin: 0;
    overflow-x: auto;
    background: var(--code-bg);
    border-radius: 0 0 8px 8px;
}

.code-content.has-expand-overlay {
    border-radius: 0;
}

.code-expand-overlay {
    width: 100%;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--button-color);
    background: var(--header-bg);
    border: 0;
    border-top: 1px solid var(--border-color);
    border-radius: 0 0 8px 8px;
    cursor: pointer;
}

.code-expand-overlay:hover {
    background: var(--button-hover-bg);
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
