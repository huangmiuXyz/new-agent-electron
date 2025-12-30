<script setup lang="ts">
import { computed } from 'vue'

interface Props {
    size?: 'small' | 'medium' | 'large' | 'mini'
    color?: string
}

const props = withDefaults(defineProps<Props>(), {
    size: 'medium',
    color: 'var(--accent-color)'
})

const spinnerSize = computed(() => {
    switch (props.size) {
        case 'mini':
            return '12px'
        case 'small':
            return '16px'
        case 'large':
            return '32px'
        default:
            return '24px'
    }
})

const borderWidth = computed(() => {
    switch (props.size) {
        case 'mini':
            return '1px'
        case 'small':
            return '1.5px'
        case 'large':
            return '3px'
        default:
            return '2px'
    }
})
</script>

<template>
    <div class="loading-container">
        <div class="loading-spinner" :style="{
            width: spinnerSize,
            height: spinnerSize,
            borderWidth: borderWidth,
            borderTopColor: color
        }"></div>
        <slot>
        </slot>
    </div>
</template>

<style scoped>
.loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.loading-spinner {
    border: solid var(--border-subtle);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>