<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'

const props = defineProps<{
    modelValue: boolean
    searchQuery: string
    placeholder?: string
    noResultsText?: string
    hasResults?: boolean
    width?: string
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'update:searchQuery', value: string): void
}>()

const containerRef = ref<HTMLElement>()

const closePopup = () => {
    emit('update:modelValue', false)
}

const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (containerRef.value && !containerRef.value.contains(target)) {
        closePopup()
    }
}

watch(() => props.modelValue, (newVal) => {
    if (newVal) {
        nextTick(() => {
            document.addEventListener('click', handleClickOutside)
        })
    } else {
        document.removeEventListener('click', handleClickOutside)
    }
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

const onSearchInput = (e: Event) => {
    emit('update:searchQuery', (e.target as HTMLInputElement).value)
}
</script>

<template>
    <div class="selector-wrapper" ref="containerRef">
        <div class="selector-trigger" @click="emit('update:modelValue', !modelValue)">
            <slot name="trigger"></slot>
        </div>

        <div class="selector-popup" :class="{ show: modelValue }" :style="{ width: width || '240px' }">
            <div class="selector-search">
                <i class="ph ph-magnifying-glass"></i>
                <input :value="searchQuery" @input="onSearchInput" type="text" :placeholder="placeholder || '搜索...'"
                    autocomplete="off" />
            </div>
            <div class="selector-list-container">
                <div v-if="!hasResults" class="no-results">
                    {{ noResultsText || '未找到结果' }}
                </div>
                <slot v-else></slot>
            </div>
        </div>
    </div>
</template>

<style scoped>
.selector-wrapper {
    position: relative;
}

.selector-trigger {
    cursor: pointer;
    display: inline-block;
}

.selector-popup {
    position: absolute;
    bottom: 38px;
    left: 0;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 10px;
    box-shadow:
        0 4px 20px rgba(0, 0, 0, 0.12),
        0 1px 4px rgba(0, 0, 0, 0.05);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 100;
    transform-origin: bottom left;
}

.selector-popup.show {
    display: flex;
    animation: popupFadeIn 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes popupFadeIn {
    from {
        opacity: 0;
        transform: scale(0.96) translateY(4px);
    }

    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.selector-search {
    padding: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    gap: 6px;
}

.selector-search input {
    border: none;
    background: transparent;
    width: 100%;
    outline: none;
    font-size: 12px;
    color: var(--text-primary);
    padding: 0;
    font-family: var(--font-stack);
}

.selector-search i {
    color: var(--text-tertiary);
    font-size: 14px;
}

.selector-list-container {
    max-height: 320px;
    overflow-y: auto;
    padding: 4px;
}

/* Scrollbar styles */
.selector-list-container::-webkit-scrollbar {
    width: 6px;
}

.selector-list-container::-webkit-scrollbar-track {
    background: transparent;
}

.selector-list-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
}

.selector-list-container::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
}

.no-results {
    padding: 20px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 12px;
}
</style>
