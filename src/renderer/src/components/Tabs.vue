<script setup lang="ts">
import { computed } from 'vue'

interface TabItem {
    id: string
    name: string
    disabled?: boolean
}

interface Props {
    items: TabItem[]
    modelValue: string
    size?: 'sm' | 'md' | 'lg'
}

interface Emits {
    (e: 'update:modelValue', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
    size: 'md'
})

const emit = defineEmits<Emits>()

const activeTab = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
})

const handleTabClick = (tabId: string) => {
    if (!props.items.find(item => item.id === tabId)?.disabled) {
        activeTab.value = tabId
    }
}
</script>

<template>
    <div class="tabs-container" :class="`tabs-${size}`">
        <div v-for="tab in items" :key="tab.id" class="tab-item" :class="{
            active: activeTab === tab.id,
            disabled: tab.disabled
        }" @click="handleTabClick(tab.id)">
            {{ tab.name }}
        </div>
    </div>
</template>

<style scoped>
.tabs-container {
    display: inline-flex;
    background: var(--bg-hover);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    max-width: 100%;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.05);
}

/* Webkit scrollbar styles */
.tabs-container::-webkit-scrollbar {
    height: 6px;
    width: 6px;
}

.tabs-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
}

.tabs-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
}

.tabs-container::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.4);
}

.tab-item {
    padding: 4px 12px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s;
    font-weight: 500;
    flex-shrink: 0;
    white-space: nowrap;
    min-width: fit-content;
}

.tab-item:hover:not(.disabled) {
    color: var(--text-primary);
    background: var(--bg-card);
}

.tab-item.active {
    background: var(--bg-card);
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.tab-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Size variants */
.tabs-sm .tab-item {
    padding: 3px 8px;
    font-size: 12px;
}

.tabs-lg .tab-item {
    padding: 6px 16px;
    font-size: 14px;
}
</style>