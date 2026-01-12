<template>
    <div class="image-container" :class="{ 'is-loading': isLoading }">
        <div v-if="isLoading" class="loading-overlay">
            <Loading size="small" />
        </div>
        <img
            v-bind="$attrs"
            :src="computedSrc"
            @load="handleLoad"
            @error="handleError"
            :style="{ opacity: isLoading ? 0 : 1 }"
        />
        <div v-if="hasError && !isLoading" class="error-placeholder">
            <slot name="error">
                <div class="error-text">图片加载失败</div>
            </slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { assetsHandler } from '@renderer/utils'

const props = defineProps<{
    src?: string
}>()

const isLoading = ref(true)
const hasError = ref(false)

const computedSrc = computed(() => {
    return assetsHandler(props.src || '')
})

watch(
    () => props.src,
    (newSrc) => {
        if (newSrc) {
            isLoading.value = true
            hasError.value = false
        } else {
            isLoading.value = false
            hasError.value = true
        }
    },
    { immediate: true }
)

const handleLoad = () => {
    isLoading.value = false
    hasError.value = false
}

const handleError = () => {
    isLoading.value = false
    hasError.value = true
}
</script>

<style scoped>
.image-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    width: 100%;
    height: 100%;
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-card-soft);
    z-index: 1;
}

img {
    transition: opacity 0.3s ease;
    max-width: 100%;
    height: auto;
}

.error-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: var(--bg-card-soft);
    color: var(--text-secondary);
    font-size: 12px;
    width: 100%;
    height: 100%;
    min-height: 100px;
}
</style>
