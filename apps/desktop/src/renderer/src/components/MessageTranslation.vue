<script setup lang="ts">
import IncremarkRenderer from './IncremarkRenderer.vue'
import { isMobile } from '@renderer/composables/useDeviceType'

const props = defineProps<{
    translations?: TranslationResult[]
    reasoningResults?: string[]
    translationLoading?: boolean
    translationController?: AbortController['abort']
    streamingText?: string
    streamingLanguage?: string
    streamingTick?: number
    reasoningText?: string
}>()

const emit = defineEmits<{
    stopTranslation: []
}>()

const showTranslation = ref(false)
const selectedTab = ref(0)
const allTabs = ref<Array<{ label: string; text: string; loading?: boolean; timestamp?: number }>>([])

// 用 watchEffect 统一同步 props → allTabs（避免 computed 缓存/长度不变的问题）
watchEffect(() => {
    const trans = props.translations || []
    const tabs = trans.map((t) => ({ label: t.targetLanguage, text: t.text, timestamp: t.timestamp }))
    if (props.translationLoading) {
        tabs.push({ label: props.streamingLanguage || '翻译', text: props.streamingText || '', loading: true })
    }
    // eslint-disable-next-line no-unused-expressions
    props.streamingTick // 额外依赖，流式更新时触发
    allTabs.value = tabs
})

// 当前选中的 tab
const currentTab = computed(() => allTabs.value[selectedTab.value])

// 当前 tab 的深度思考内容（流式中取 reasoningText，完成时取 reasoningResults）
const currentReasoning = computed(() => {
    if (currentTab.value?.loading) return props.reasoningText || ''
    const idx = selectedTab.value
    return props.reasoningResults?.[idx] || ''
})

// tab 数量增加时自动切到最新；翻译完成（数量不变但内容变了）也切
watchEffect(() => {
    const n = allTabs.value.length
    if (n === 0) return
    // 有流式 tab（最后一个）时自动选中；无流式 tab 时也选中最后一个（刚完成）
    if (props.translationLoading || selectedTab.value >= n) {
        selectedTab.value = n - 1
    }
})

// 翻译开始时展开
watchEffect(() => {
    if (props.translationLoading) showTranslation.value = true
})

const reasoningExpanded = ref(true)
const reasoningViewportHeight = computed(() => {
    if (!currentReasoning.value) return 48
    const lines = currentReasoning.value.split('\n').length
    return Math.min(Math.max(lines * 21, 48), isMobile.value ? 260 : 360)
})

const selectTab = (index: number) => {
    if (index < allTabs.value.length) selectedTab.value = index
}

const truncateLanguageName = (name: string, maxLength: number = 10) => {
    if (name.length <= maxLength) return name
    return name.substring(0, maxLength) + '...'
}

const handleStopTranslation = () => {
    if (props.translationController) props.translationController()
    emit('stopTranslation')
}
</script>

<template>
    <div v-if="allTabs.length > 0" class="translation-container">
        <div class="translation-header" @click="showTranslation = !showTranslation">
            <span class="translation-label">
                翻译
                <span v-if="translationLoading" class="loading-indicator">
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                </span>
            </span>
            <div class="translation-controls">
                <Button v-if="translationLoading && translationController" variant="icon" size="sm"
                    @click.stop="handleStopTranslation" title="停止翻译">
                    <component :is="useIcon('Stop')" />
                </Button>
                <span class="translation-toggle">
                    {{ translationLoading ? '正在翻译中...' : (showTranslation ? '收起' : '展开') }}
                </span>
            </div>
        </div>

        <div v-if="showTranslation">
            <!-- tab 栏 -->
            <div v-if="allTabs.length > 0" class="translation-tabs">
                <div v-for="(tab, index) in allTabs" :key="index" class="translation-tab"
                    :class="{ active: selectedTab === index, 'tab-loading': tab.loading }"
                    @click="selectTab(index)">
                    <span :title="tab.label" class="language-name">{{ truncateLanguageName(tab.label || '翻译') }}</span>
                    <span v-if="tab.timestamp" class="translation-time">{{ new Date(tab.timestamp).toLocaleTimeString() }}</span>
                    <span v-if="tab.loading" class="tab-loading-dot" />
                </div>
            </div>

            <!-- 当前 tab 内容 -->
            <div v-if="currentTab" class="translation-content">
                <!-- 深度思考内容 -->
                <div v-if="currentReasoning" class="reasoning-block">
                    <div class="reasoning-header" @click.stop="reasoningExpanded = !reasoningExpanded">
                        <span class="reasoning-label-text">思考过程</span>
                        <svg class="reasoning-arrow" :class="{ rotated: reasoningExpanded }" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
                            <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/>
                        </svg>
                    </div>
                    <div v-show="reasoningExpanded" class="reasoning-body">
                        <VirtualParagraphText
                            class="reasoning-virtual-text"
                            :text="currentReasoning"
                            :height="reasoningViewportHeight"
                            split-mode="blank-line"
                            :font-size="11"
                            :line-height="17"
                            :bottom-threshold="1"
                            :paragraph-padding-block="4"
                            :paragraph-gap="2"
                            :min-paragraph-height="21"
                            stick-to-bottom
                        />
                    </div>
                </div>

                <div v-if="!currentTab.loading" class="translation-info">
                    <span :title="currentTab.label" class="language-name">{{ truncateLanguageName(currentTab.label || '翻译') }}</span>
                    <span v-if="currentTab.timestamp" class="translation-time">{{ new Date(currentTab.timestamp).toLocaleString() }}</span>
                </div>
                <div v-if="currentTab.text">
                    <IncremarkRenderer :text="currentTab.text" :disable-translation="true" />
                </div>
                <div v-else-if="currentTab.loading" class="translation-stream-waiting">等待翻译结果...</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.translation-container {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    background-color: var(--bg-hover);
    position: relative;
}

.translation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background-color: var(--border-color-light);
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
}

.translation-header:hover {
    background-color: var(--border-color);
}

.translation-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
}

.translation-count {
    font-size: 10px;
    color: var(--text-sub);
    font-weight: normal;
}

.translation-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.translation-toggle {
    font-size: 10px;
    color: var(--text-sub);
}

.stop-translation-btn {
    font-size: 10px;
    padding: 2px 6px;
    background-color: var(--color-danger);
    color: var(--bg-card);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.stop-translation-btn:hover {
    background-color: rgba(239, 68, 68, 0.8);
}

.translation-content {
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
}

.translation-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-hover);
}

.translation-tab {
    padding: 6px 12px;
    font-size: 11px;
    color: var(--text-sub);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.translation-tab:hover {
    background-color: var(--border-color-light);
}

.translation-tab.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
    background-color: var(--bg-hover);
}

.language-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 加载指示器 */
.loading-indicator {
    display: flex;
    align-items: center;
    gap: 2px;
}

.loading-indicator .loading-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: var(--accent-color);
    animation: pulse 1.4s ease-in-out infinite;
}

.loading-indicator .loading-dot:nth-child(1) { animation-delay: 0s; }
.loading-indicator .loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-indicator .loading-dot:nth-child(3) { animation-delay: 0.4s; }

.translation-stream-waiting {
    padding: 16px;
    font-size: 12px;
    color: var(--text-tertiary);
    text-align: center;
}

.tab-loading {
    opacity: 0.7;
}

.tab-loading-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-primary);
    margin-left: 4px;
}

.tab-streaming {
    border-left: 2px solid var(--color-primary);
}

.reasoning-block {
    margin-bottom: 8px;
}

.reasoning-header {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
}

.reasoning-header:hover {
    color: var(--text-primary);
}

.reasoning-arrow {
    transition: transform 0.2s ease;
    color: var(--text-tertiary);
}

.reasoning-arrow.rotated {
    transform: rotate(180deg);
}

.reasoning-body {
    border-left: 2px solid var(--border-color-light);
    padding-left: 8px;
    margin-left: 2px;
}

.reasoning-virtual-text {
    color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
}

@keyframes pulse {

    0%,
    80%,
    100% {
        opacity: 0.3;
        transform: scale(0.8);
    }

    40% {
        opacity: 1;
        transform: scale(1);
    }
}
</style>
