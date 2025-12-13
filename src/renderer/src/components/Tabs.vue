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
    display: flex;
    background: #f1f1f1;
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
}

.tab-item {
    padding: 4px 12px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s;
    font-weight: 500;
}

.tab-item:hover:not(.disabled) {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.5);
}

.tab-item.active {
    background: #fff;
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