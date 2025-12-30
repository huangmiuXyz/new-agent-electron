<template>
    <div class="reasoning-block" :class="{ 'is-open': isReasoningExpanded }">
        <div class="reasoning-header" @click="toggleReasoning">
            <div class="reasoning-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256"
                    fill="currentColor">
                    <path
                        d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z">
                    </path>
                </svg>
                <span>Reasoning Process</span>
            </div>
            <svg class="toggle-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256"
                fill="currentColor">
                <path
                    d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z">
                </path>
            </svg>
        </div>
        <div class="reasoning-body" v-show="isReasoningExpanded">{{ reasoning_content }}</div>
    </div>
</template>
<script lang="ts" setup>
defineProps<{ reasoning_content: string }>()
const isReasoningExpanded = ref(false)
const toggleReasoning = () => {
    isReasoningExpanded.value = !isReasoningExpanded.value
}
</script>
<style>
.reasoning-block {
    border: 1px solid var(--border-color-light);
    border-radius: 6px;
    background-color: var(--bg-hover);
    overflow: hidden;
}

.reasoning-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    background-color: var(--bg-secondary);
    transition: background 0.1s;
}

.reasoning-header:hover {
    background-color: var(--bg-secondary-hover);
}

.reasoning-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
}

.toggle-icon {
    color: var(--text-sub);
    transition: transform 0.2s ease;
}

.reasoning-block.is-open .toggle-icon {
    transform: rotate(180deg);
}

.reasoning-body {
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-sub);
    background-color: var(--bg-card);
    border-top: 1px solid var(--border-color-light);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: pre-wrap;
}
</style>