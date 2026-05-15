<template>
    <Teleport to="body">
        <Transition name="viewer-fade">
            <div v-if="visible" class="image-viewer-overlay" @click="close" @keydown.esc="close" tabindex="-1">
                <div class="image-viewer-content" @click.stop>
                    <!-- Main Image with Transform -->
                    <div class="image-stage" @wheel.prevent="handleWheel" @click="close">
                        <img
                            :src="currentSrc"
                            class="viewer-image"
                            :style="imageStyle"
                            @mousedown="startDrag"
                            @click.stop
                        />
                    </div>

                    <!-- Close Button -->
                    <Button class="close-button" variant="text" @click="close">
                        <CloseIcon />
                    </Button>

                    <!-- Navigation Arrows -->
                    <template v-if="images.length > 1">
                        <Button class="nav-button prev" variant="text" @click="prevImage">
                            <ChevronBack />
                        </Button>
                        <Button class="nav-button next" variant="text" @click="nextImage">
                            <ChevronForward />
                        </Button>
                    </template>

                    <!-- Toolbar -->
                    <div class="viewer-toolbar">
                        <Button variant="text" @click="zoomIn" title="放大">
                            <AddIcon />
                        </Button>
                        <Button variant="text" @click="zoomOut" title="缩小">
                            <RemoveIcon />
                        </Button>
                        <Button variant="text" @click="resetTransform" title="重置">
                            <RefreshIcon />
                        </Button>
                        <div class="toolbar-divider"></div>
                        <Button variant="text" @click="rotateLeft" title="向左旋转">
                            <RotateLeftIcon />
                        </Button>
                        <Button variant="text" @click="rotateRight" title="向右旋转">
                            <RotateRightIcon />
                        </Button>
                        <div class="toolbar-divider"></div>
                        <Button variant="text" @click="copyImage" title="复制图片">
                            <CopyIcon />
                        </Button>
                        <Button variant="text" @click="downloadImage" title="下载">
                            <DownloadIcon />
                        </Button>
                    </div>

                    <!-- Thumbnails -->
                    <div v-if="images.length > 1" class="thumbnail-list">
                        <div
                            v-for="(img, index) in images"
                            :key="index"
                            class="thumbnail-item"
                            :class="{ active: index === currentIndex }"
                            @click="currentIndex = index"
                        >
                            <img :src="img" />
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { copyImageToClipboard } from '@renderer/utils'

const props = withDefaults(defineProps<{
    src?: string
    images?: string[]
    visible: boolean
    initialIndex?: number
}>(), {
    src: '',
    images: () => [],
    initialIndex: 0
})

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
}>()

const images = computed(() => {
    if (props.images.length > 0) return props.images
    return props.src ? [props.src] : []
})

const currentIndex = ref(props.initialIndex)
const currentSrc = computed(() => images.value[currentIndex.value] || '')

watch(
    [() => props.initialIndex, images, () => props.visible],
    () => {
        const lastIndex = Math.max(0, images.value.length - 1)
        currentIndex.value = Math.min(Math.max(props.initialIndex, 0), lastIndex)
    },
    { immediate: true }
)

// Transform state
const scale = ref(1)
const rotate = ref(0)
const translateX = ref(0)
const translateY = ref(0)

const imageStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotate.value}deg)`,
    transition: isDragging.value ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)'
}))

// Reset transform when image changes or visible changes
watch([currentIndex, () => props.visible], () => {
    resetTransform()
})

const resetTransform = () => {
    scale.value = 1
    rotate.value = 0
    translateX.value = 0
    translateY.value = 0
}

const zoomIn = () => {
    scale.value = Math.min(scale.value + 0.2, 5)
}

const zoomOut = () => {
    scale.value = Math.max(scale.value - 0.2, 0.2)
}

const rotateLeft = () => {
    rotate.value -= 90
}

const rotateRight = () => {
    rotate.value += 90
}

const handleWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) {
        zoomIn()
    } else {
        zoomOut()
    }
}

// Drag functionality
const isDragging = ref(false)
const startPos = { x: 0, y: 0 }

const startDrag = (e: MouseEvent) => {
    isDragging.value = true
    startPos.x = e.clientX - translateX.value
    startPos.y = e.clientY - translateY.value

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.value) return
        translateX.value = e.clientX - startPos.x
        translateY.value = e.clientY - startPos.y
    }

    const handleMouseUp = () => {
        isDragging.value = false
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
}

// Navigation
const nextImage = () => {
    if (images.value.length <= 1) return
    currentIndex.value = (currentIndex.value + 1) % images.value.length
}

const prevImage = () => {
    if (images.value.length <= 1) return
    currentIndex.value = (currentIndex.value - 1 + images.value.length) % images.value.length
}

// Copy
const copyImage = async () => {
    if (!currentSrc.value) return
    await copyImageToClipboard(currentSrc.value)
}

// Download
const downloadImage = async () => {
    try {
        const response = await fetch(currentSrc.value)
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `image-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
    } catch (err) {
        console.error('Failed to download image:', err)
    }
}

const close = () => {
    emit('update:visible', false)
}

// Icons
const {
    Close: CloseIcon,
    ChevronLeft: ChevronBack,
    ChevronRight: ChevronForward,
    ZoomIn: AddIcon,
    ZoomOut: RemoveIcon,
    Refresh: RefreshIcon,
    Copy: CopyIcon,
    Download: DownloadIcon,
    RotateLeft: RotateLeftIcon,
    RotateRight: RotateRightIcon
} = useIcon(['Close', 'ChevronLeft', 'ChevronRight', 'ZoomIn', 'ZoomOut', 'Refresh', 'Copy', 'Download', 'RotateLeft', 'RotateRight'])

useEventListener('keydown', (e) => {
    if (!props.visible) return
    if (e.key === 'Escape') close()
    if (e.key === 'ArrowLeft') prevImage()
    if (e.key === 'ArrowRight') nextImage()
})
</script>

<style scoped>
.image-viewer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: zoom-out;
}

.image-viewer-content {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: default;
    overflow: hidden;
}

.image-stage {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.viewer-image {
    max-width: 90%;
    max-height: 80%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    cursor: grab;
}

.viewer-image:active {
    cursor: grabbing;
}

.close-button {
    position: absolute;
    top: 20px;
    right: 20px;
    color: white !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 50% !important;
    width: 40px !important;
    height: 40px !important;
    padding: 0 !important;
    min-width: unset !important;
    min-height: unset !important;
    z-index: 10;
}

.close-button:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: white !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 50% !important;
    width: 50px !important;
    height: 50px !important;
    padding: 0 !important;
    min-width: unset !important;
    min-height: unset !important;
    z-index: 10;
}

.nav-button:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.nav-button.prev { left: 20px; }
.nav-button.next { right: 20px; }

.viewer-toolbar {
    position: absolute;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    border-radius: 30px;
    padding: 8px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 10;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.viewer-toolbar :deep(.btn) {
    color: white !important;
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    border-radius: 50% !important;
}

.viewer-toolbar :deep(.btn:hover) {
    background: rgba(255, 255, 255, 0.1) !important;
}

.toolbar-divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    margin: 0 4px;
}

.thumbnail-list {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 8px;
    z-index: 10;
    max-width: 80%;
    overflow-x: auto;
}

.thumbnail-item {
    width: 50px;
    height: 50px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    opacity: 0.6;
    transition: all 0.2s;
    flex-shrink: 0;
}

.thumbnail-item.active {
    border-color: var(--accent-color);
    opacity: 1;
}

.thumbnail-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    .nav-button {
        width: 40px !important;
        height: 40px !important;
    }
    .viewer-toolbar {
        bottom: 80px;
        padding: 4px 12px;
        gap: 4px;
    }
    .thumbnail-list {
        bottom: 10px;
    }
}
</style>
