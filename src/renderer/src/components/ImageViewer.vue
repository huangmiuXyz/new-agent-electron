<template>
    <Teleport to="body">
        <Transition name="viewer-fade">
            <div v-if="visible" class="image-viewer-overlay" @click="close" @keydown.esc="close" tabindex="-1">
                <div class="image-viewer-content" @click.stop>
                    <img :src="src" class="viewer-image" />
                    <Button class="close-button" variant="text" @click="close">
                        <CloseIcon />
                    </Button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

const props = defineProps<{
    src: string
    visible: boolean
}>()

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
}>()

const close = () => {
    emit('update:visible', false)
}

const CloseIcon = useIcon('Close')

useEventListener('keydown', (e) => {
    if (e.key === 'Escape' && props.visible) {
        close()
    }
})
</script>

<style scoped>
.image-viewer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: zoom-out;
}

.image-viewer-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
}

.viewer-image {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.close-button {
    position: absolute;
    top: -40px;
    right: -40px;
    color: white !important;
    font-size: 24px;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
    opacity: 0.7;
    min-width: unset !important;
    min-height: unset !important;
}

.close-button:hover {
    opacity: 1;
}

.viewer-fade-enter-active,
.viewer-fade-leave-active {
    transition: opacity 0.3s ease;
}

.viewer-fade-enter-from,
.viewer-fade-leave-to {
    opacity: 0;
}

@media (max-width: 768px) {
    .close-button {
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        padding: 4px;
    }
}
</style>
