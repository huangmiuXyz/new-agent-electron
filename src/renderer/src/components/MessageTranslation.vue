<script setup lang="ts">
const props = defineProps<{
    translations?: TranslationResult[]
    translationLoading?: boolean
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
            <span class="translation-toggle">
                {{ translationLoading ? '正在翻译中...' : (showTranslation ? '收起' : '展开') }}
            </span>
        </div>

        <div v-if="showTranslation">
            <!-- 翻译版本选择器 -->
            <div v-if="props.translations && props.translations.length > 1" class="translation-tabs">
                <div v-for="(translation, index) in props.translations" :key="index" class="translation-tab"
                    :class="{ active: selectedTranslationIndex === index }" @click="selectTranslation(index)">
                    {{ translation.targetLanguage || '中文' }}
                    <span class="translation-time">
                        {{ new Date(translation.timestamp).toLocaleTimeString() }}
                    </span>
                </div>
            </div>

            <!-- 翻译内容 -->
            <div v-if="selectedTranslation" class="translation-content">
                <div class="translation-info">
                    {{ selectedTranslation?.targetLanguage || '中文' }}
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
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background-color: #f9fafb;
    position: relative;
}

.translation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background-color: #f3f4f6;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
}

.translation-header:hover {
    background-color: #e5e7eb;
}

.translation-label {
    font-size: 11px;
    font-weight: 600;
    color: #4b5563;
    display: flex;
    align-items: center;
    gap: 4px;
}

.translation-count {
    font-size: 10px;
    color: #6b7280;
    font-weight: normal;
}

.translation-toggle {
    font-size: 10px;
    color: #6b7280;
    margin-left: auto;
}

.translation-content {
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.5;
    color: #1f2937;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.translation-tabs {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
    background-color: #f9fafb;
}

.translation-tab {
    padding: 6px 12px;
    font-size: 11px;
    color: #6b7280;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
}

.translation-tab:hover {
    background-color: #f3f4f6;
}

.translation-tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
    background-color: #f9fafb;
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
    background-color: #3b82f6;
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
    color: #6b7280;
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
    background-color: #3b82f6;
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