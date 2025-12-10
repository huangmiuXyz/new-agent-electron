<script setup lang="ts">
import { FileUIPart } from 'ai';
import { useDropZone } from '@vueuse/core';

// 定义组件的事件和属性
const emit = defineEmits<{
    filesSelected: [files: Array<FileUIPart & { blobUrl: string; }>]
    fileRemoved: [index: number]
}>()

// 文件上传相关状态
const selectedFiles = ref<Array<FileUIPart & { blobUrl: string; }>>([])
const FileInputRef = ref<HTMLInputElement>()
const inputContainerRef = ref<HTMLElement>()

// 拖拽状态
const isDragOver = ref(false)

// 图标
const FileUpload = useIcon('FileUpload')

// 处理文件上传的通用函数
const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const processedFiles = await Promise.all(
        fileArray.map(async f => ({
            url: await blobToDataURL(f),
            mediaType: f.type,
            blobUrl: URL.createObjectURL(f),
            filename: f.name,
            type: 'file' as const
        }))
    )

    selectedFiles.value.push(...processedFiles)
    emit('filesSelected', processedFiles)
}

// 使用 useDropZone 处理拖拽上传
const { isOverDropZone } = useDropZone(inputContainerRef, {
    onDrop: (files) => {
        if (files && files.length > 0) {
            processFiles(files)
        }
        isDragOver.value = false
    },
    onEnter: () => {
        isDragOver.value = true
    },
    onLeave: () => {
        isDragOver.value = false
    }
})

// 监听粘贴事件
const handlePaste = async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const files: File[] = []

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
            const file = item.getAsFile()
            if (file) {
                files.push(file)
            }
        }
    }

    if (files.length > 0) {
        event.preventDefault()
        await processFiles(files)
    }
}

const handleUpload = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (!files) return

    await processFiles(files)
    FileInputRef.value!.value = ''
}

const removeFile = (index: number) => {
    const file = selectedFiles.value[index]
    if (file.blobUrl) {
        URL.revokeObjectURL(file.blobUrl)
    }
    selectedFiles.value.splice(index, 1)
    emit('fileRemoved', index)
}

// 暴露给父组件的方法和状态
defineExpose({
    selectedFiles,
    isDragOver,
    isOverDropZone,
    handlePaste,
    processFiles,
    removeFile
})
</script>

<template>
    <div class="file-upload" ref="inputContainerRef" :class="{ 'drag-over': isDragOver || isOverDropZone }">
        <!-- 文件上传按钮 -->
        <input ref="FileInputRef" type="file" multiple @change="handleUpload" style="display: none;" />
        <Button variant="icon" size="sm" @click="FileInputRef?.click()">
            <FileUpload />
        </Button>

        <!-- 拖拽提示 -->
        <div v-if="isDragOver || isOverDropZone" class="drag-overlay">
            <div class="drag-message">
                <FileUpload />
                <span>释放以上传文件</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.file-upload {
    position: relative;
}

.drag-over {
    border-color: var(--primary-color, #007bff);
    background-color: rgba(0, 123, 255, 0.05);
}

.drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 123, 255, 0.1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
}

.drag-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--primary-color, #007bff);
    font-weight: 500;
}

.drag-message svg {
    width: 32px;
    height: 32px;
}
</style>