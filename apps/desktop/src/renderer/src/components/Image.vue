<template>
    <div
        class="image-container"
        :class="{ 'is-loading': computedLoading, 'is-previewable': preview && !hasError }"
        @contextmenu.prevent.stop="handleContextMenu"
    >
        <div v-if="computedLoading" class="loading-overlay">
            <Loading size="small" />
        </div>
        <img
            v-bind="$attrs"
            :src="computedSrc"
            @load="handleLoad"
            @error="handleError"
            @click="handlePreview"
            @contextmenu.prevent.stop="handleContextMenu"
            :style="{ opacity: computedLoading ? 0 : 1 }"
        />
        <div v-if="hasError && !computedLoading" class="error-placeholder">
            <slot name="error">
                <div class="error-text">图片加载失败</div>
            </slot>
        </div>
        <ImageViewer
            v-if="preview"
            v-model:visible="showViewer"
            :src="computedSrc"
            :images="images"
            :initial-index="viewerIndex"
        />
    </div>
</template>

<script setup lang="ts">
import { assetsHandler, copyText } from '@renderer/utils'
import { useContextMenu, type MenuItem } from '@renderer/composables/useContextMenu'

const props = defineProps<{
    src?: string
    preview?: boolean
    images?: string[]
    initialIndex?: number
    loading?: boolean
}>()

const internalLoading = ref(true)
const hasError = ref(false)
const showViewer = ref(false)
const viewerIndex = ref(props.initialIndex || 0)
const { showContextMenu } = useContextMenu()
const { Eye, Copy, Download } = useIcon(['Eye', 'Copy', 'Download'])

const computedLoading = computed(() => {
    return props.loading !== undefined ? props.loading : internalLoading.value
})

const computedSrc = computed(() => {
    return assetsHandler(props.src || '')
})

const handlePreview = () => {
    if (props.preview && !hasError.value) {
        viewerIndex.value = props.initialIndex || 0
        showViewer.value = true
    }
}

const downloadImage = async () => {
    if (!computedSrc.value) return
    try {
        const response = await fetch(computedSrc.value)
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

const copyImage = async () => {
    if (!computedSrc.value) return
    try {
        if (!navigator.clipboard?.write) {
            copyText(computedSrc.value)
            return
        }
        const ClipboardItemConstructor = (window as any).ClipboardItem
        if (!ClipboardItemConstructor) {
            copyText(computedSrc.value)
            return
        }
        const response = await fetch(computedSrc.value)
        const blob = await response.blob()
        const type = blob.type || 'image/png'
        const item = new ClipboardItemConstructor({ [type]: blob })
        await navigator.clipboard.write([item])
    } catch (err) {
        console.error('复制图片失败:', err)
    }
}

const handleContextMenu = (event: MouseEvent) => {
    const canOperate = !!computedSrc.value && !computedLoading.value && !hasError.value
    const options: MenuItem[] = [
        {
            label: '预览',
            icon: Eye,
            disabled: !props.preview || !canOperate,
            onClick: () => handlePreview()
        },
        {
            label: '复制',
            icon: Copy,
            disabled: !canOperate,
            onClick: () => void copyImage()
        },
        {
            label: '下载',
            icon: Download,
            disabled: !canOperate,
            onClick: () => void downloadImage()
        }
    ]

    showContextMenu(event, options)
}

watch(
    () => props.src,
    (newSrc) => {
        if (newSrc) {
            internalLoading.value = true
            hasError.value = false
        } else {
            internalLoading.value = false
            hasError.value = true
        }
    },
    { immediate: true }
)

const handleLoad = () => {
    internalLoading.value = false
    hasError.value = false
}

const handleError = () => {
    internalLoading.value = false
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

.is-previewable img {
    cursor: zoom-in;
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
