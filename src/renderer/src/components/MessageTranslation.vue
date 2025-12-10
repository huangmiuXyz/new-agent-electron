<script setup lang="ts">
const props = defineProps<{
    translations?: TranslationResult[]
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
</script>

<template>
    <div v-if="latestTranslation" class="translation-container">
        <div class="translation-header" @click="showTranslation = !showTranslation">
            <span class="translation-label">
                翻译
                <span v-if="props.translations && props.translations.length > 1" class="translation-count">
                    ({{ selectedTranslationIndex + 1 }}/{{ props.translations.length }})
                </span>
            </span>
            <span class="translation-toggle">{{ showTranslation ? '收起' : '展开' }}</span>
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
            <div class="translation-content">
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
</style>