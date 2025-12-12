<script setup lang="ts">
import { FileUIPart } from 'ai';
import { useDropZone } from '@vueuse/core';

interface Props {
    files?: Array<FileUIPart & { blobUrl?: string; name?: string }>;
    removable?: boolean;
    dropZoneRef?: HTMLElement;
    inputRef?: HTMLTextAreaElement;
    onRemove?: (index: number) => void;
}

const props = withDefaults(defineProps<Props>(), {
    removable: true,
});

const emit = defineEmits<{
    remove: [index: number];
    filesSelected: [files: Array<FileUIPart & { blobUrl: string; }>]
}>();

// 文件上传相关状态
const selectedFiles = ref<Array<FileUIPart & { blobUrl?: string; }>>(props.files || [])
const FileInputRef = useTemplateRef('FileInputRef')

// 拖拽状态
const isDragOver = ref(false)

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
const { isOverDropZone } = useDropZone(() => props.dropZoneRef, {
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

// 通过传入的input ref监听粘贴事件
watchEffect(() => {
    const inputRef = props.inputRef
    if (inputRef) {
        inputRef.addEventListener('paste', handlePaste)
        // 返回清理函数
        return () => {
            inputRef.removeEventListener('paste', handlePaste)
        }
    }
    // 如果没有inputRef，返回空函数
    return () => { }
})

const handleUpload = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (!files) return

    await processFiles(files)
    FileInputRef.value!.value = ''
}

const handleRemove = (index: number) => {
    const file = selectedFiles.value[index]
    if (file.blobUrl) {
        URL.revokeObjectURL(file.blobUrl)
    }
    selectedFiles.value.splice(index, 1)

    if (props.onRemove) {
        props.onRemove(index);
    } else {
        emit('remove', index);
    }
};

const handleOpen = (file: any) => {
    const fileUrl = file.blobUrl || file.url;

    if (fileUrl) {
        if (window.api && window.api.openFile) {
            window.api.openFile(fileUrl);
        } else {
            window.open(fileUrl, '_blank');
        }
    }
};

const getBlobUrl = (url: string): string => {
    const blob = dataURLToBlob(url);
    return URL.createObjectURL(blob);
};

const getFileIcon = (file: any) => {
    const mediaType = file.mediaType || '';
    const fileName = file.name || file.filename || '';
    if (mediaType.includes('pdf')) {
        return 'FileCertificate';
    } else if (mediaType.includes('word') || mediaType.includes('document') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
        return 'File';
    } else if (mediaType.includes('excel') || mediaType.includes('spreadsheet') || fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        return 'FileAnalytics';
    } else if (mediaType.includes('powerpoint') || mediaType.includes('presentation') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
        return 'FileInvoice';
    } else if (fileName.endsWith('.md') || mediaType.includes('markdown')) {
        return 'Markdown';
    } else if (mediaType.includes('text/') || mediaType.includes('plain') || fileName.endsWith('.txt')) {
        return 'FileText';
    } else if (mediaType.includes('javascript') || mediaType.includes('json') || mediaType.includes('xml') || mediaType.includes('html') || mediaType.includes('css') ||
        fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.jsx') || fileName.endsWith('.tsx') ||
        fileName.endsWith('.json') || fileName.endsWith('.xml') || fileName.endsWith('.html') || fileName.endsWith('.css') ||
        fileName.endsWith('.py') || fileName.endsWith('.java') || fileName.endsWith('.cpp') || fileName.endsWith('.c') ||
        fileName.endsWith('.go') || fileName.endsWith('.rs') || fileName.endsWith('.php') || fileName.endsWith('.rb')) {
        return 'FileCode';
    } else if (mediaType.includes('zip') || mediaType.includes('rar') || mediaType.includes('tar') || mediaType.includes('gzip') ||
        fileName.endsWith('.zip') || fileName.endsWith('.rar') || fileName.endsWith('.tar') || fileName.endsWith('.gz') || fileName.endsWith('.7z')) {
        return 'FileZip';
    } else if (mediaType.includes('audio/') || fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.flac') || fileName.endsWith('.aac')) {
        return 'FileMusic';
    } else if (mediaType.includes('video/') || fileName.endsWith('.mp4') || fileName.endsWith('.avi') || fileName.endsWith('.mov') || fileName.endsWith('.mkv')) {
        return 'Video';
    }

    return 'File';
};
const triggerUpload = () => {
    FileInputRef.value!.click()
}
// 暴露给父组件的方法和状态
defineExpose({
    selectedFiles,
    isDragOver,
    isOverDropZone,
    triggerUpload
});

// 监听 props.files 的变化
watch(() => props.files, (newFiles) => {
    if (newFiles) {
        selectedFiles.value = [...newFiles] as Array<FileUIPart & { blobUrl?: string; }>;
    }
}, { immediate: true, deep: true });
</script>

<template>
    <div class="file-upload-preview" :class="{ 'drag-over': isDragOver || isOverDropZone }">
        <!-- 文件预览区域 -->
        <div v-if="selectedFiles.length > 0" class="file-preview-container">
            <div v-for="(file, index) in selectedFiles" :key="index" class="file-preview-item"
                @dblclick="handleOpen(file)">
                <img v-if="file.mediaType?.startsWith('image/')" :src="file.blobUrl || file.url || getBlobUrl(file.url)"
                    class="preview-file" />

                <div v-else class="preview-generic">
                    <div class="generic-icon">
                        <component :is="useIcon(getFileIcon(file))" v-if="useIcon(getFileIcon(file))" />
                        <span v-else>📄</span>
                    </div>
                    <span class="file-name" :title="file.filename">{{ file.filename }}</span>
                </div>

                <button v-if="removable" class="remove-file-btn" @click="handleRemove(index)">×</button>
            </div>
        </div>
        <input ref="FileInputRef" type="file" multiple @change="handleUpload" style="display: none;" />
    </div>
</template>

<style scoped>
.file-upload-preview {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.file-preview-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.file-preview-item {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
}

.preview-file {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.preview-generic {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px;
}

.generic-icon {
    font-size: 24px;
    color: #6b7280;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.file-name {
    font-size: 10px;
    color: #374151;
    text-align: center;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
}

.remove-file-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 1;
    transition: background 0.2s;
    z-index: 10;
}

.remove-file-btn:hover {
    background: rgba(0, 0, 0, 0.8);
}

.upload-section {
    display: flex;
    align-items: center;
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