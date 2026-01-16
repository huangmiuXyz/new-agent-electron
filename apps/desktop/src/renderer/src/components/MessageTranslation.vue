<script setup lang="ts">
const props = defineProps<{
    translations?: TranslationResult[]
    translationLoading?: boolean
    translationController?: AbortController['abort']
}>()

const emit = defineEmits<{
    stopTranslation: []
}>()

// 获取最新的翻译结果
const latestTranslation = computed(() => {
    if (!props.translations || props.translations.length === 0) {
        return null
    }
    return props.translations[props.translations.length - 1]
})

// 翻译显示状态
const showTranslation = ref(false)
const selectedTranslationIndex = ref(0)

// 当前选中的翻译
const selectedTranslation = computed(() => {
    if (!props.translations || props.translations.length === 0) {
        return null
    }
    return props.translations[selectedTranslationIndex.value]
})

// 选择翻译版本
const selectTranslation = (index: number) => {
    selectedTranslationIndex.value = index
}

// 初始化选中最新翻译
watch(() => props.translations, (newTranslations) => {
    if (newTranslations && newTranslations.length > 0) {
        selectedTranslationIndex.value = newTranslations.length - 1
    }
}, { immediate: true })

// 如果正在加载翻译，自动展开显示加载状态
watch(() => props.translationLoading, (newLoading) => {
    if (newLoading) {
        showTranslation.value = true
    }
})

// 截断长语言名称，用于显示
const truncateLanguageName = (name: string, maxLength: number = 10) => {
    if (name.length <= maxLength) return name
    return name.substring(0, maxLength) + '...'
}

// 停止翻译
const handleStopTranslation = () => {
    if (props.translationController) {
        props.translationController()
    }
    emit('stopTranslation')
}
</script>

<template>
    <div v-if="latestTranslation || translationLoading" class="translation-container">
        <div class="translation-header" @click="showTranslation = !showTranslation">
            <span class="translation-label">
                翻译
                <span v-if="translationLoading" class="loading-indicator">
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                </span>
                <span v-else-if="props.translations && props.translations.length > 1" class="translation-count">
                    ({{ selectedTranslationIndex + 1 }}/{{ props.translations.length }})
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
            <!-- 翻译版本选择器 -->
            <div v-if="props.translations && props.translations.length > 1" class="translation-tabs">
                <div v-for="(translation, index) in props.translations" :key="index" class="translation-tab"
                    :class="{ active: selectedTranslationIndex === index }" @click="selectTranslation(index)">
                    <span :title="translation.targetLanguage" class="language-name">
                        {{ truncateLanguageName(translation.targetLanguage || '中文') }}
                    </span>
                    <span class="translation-time">
                        {{ new Date(translation.timestamp).toLocaleTimeString() }}
                    </span>
                </div>
            </div>

            <!-- 翻译内容 -->
            <div v-if="selectedTranslation" class="translation-content">
                <div class="translation-info">
                    <span :title="selectedTranslation?.targetLanguage" class="language-name">
                        {{ truncateLanguageName(selectedTranslation?.targetLanguage || '中文') }}
                    </span>
                    <span class="translation-time">
                        {{ selectedTranslation ? new Date(selectedTranslation.timestamp).toLocaleString() : '' }}
                    </span>
                </div>
                <div class="translation-text">
                    {{ selectedTranslation?.text }}
                </div>
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

/* 翻译加载状态样式 */

.loading-dots {
    display: flex;
    align-items: center;
    gap: 4px;
}

.loading-dots .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--accent-color);
    animation: pulse 1.4s ease-in-out infinite;
}

.loading-dots .dot:nth-child(1) {
    animation-delay: 0s;
}

.loading-dots .dot:nth-child(2) {
    animation-delay: 0.2s;
}

.loading-dots .dot:nth-child(3) {
    animation-delay: 0.4s;
}

.loading-text {
    font-size: 12px;
    color: var(--text-sub);
}


/* 标题中的加载指示器 */
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

.loading-indicator .loading-dot:nth-child(1) {
    animation-delay: 0s;
}

.loading-indicator .loading-dot:nth-child(2) {
    animation-delay: 0.2s;
}

.loading-indicator .loading-dot:nth-child(3) {
    animation-delay: 0.4s;
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