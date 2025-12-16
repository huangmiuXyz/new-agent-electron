<script setup lang="ts">
interface Props {
    files?: Array<UploadFile>;
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
    filesSelected: [files: Array<UploadFile>]
}>();

const {
    selectedFiles,
    isDragOver,
    isOverDropZone,
    removeFile,
    triggerUpload,
    handlePaste
} = useUpload({
    files: props.files as UploadFile[],
    dropZoneRef: ref(props.dropZoneRef),
    inputRef: ref(props.inputRef),
    onFilesSelected: (files) => emit('filesSelected', files as Array<UploadFile>),
    onRemove: (index) => {
        if (props.onRemove) {
            props.onRemove(index);
        } else {
            emit('remove', index);
        }
    }
});


const handleRemove = (index: number) => {
    removeFile(index);
};

// 暴露给父组件的方法和状态
defineExpose({
    selectedFiles,
    isDragOver,
    isOverDropZone,
    triggerUpload,
    handlePaste
});
</script>

<template>
    <div class="file-upload-preview" :class="{ 'drag-over': isDragOver || isOverDropZone }">
        <!-- 文件预览区域 -->
        <div v-if="selectedFiles.length > 0" class="file-preview-container">
            <div v-for="(file, index) in selectedFiles" :key="index" class="file-preview-item">
                <img v-if="file.mediaType?.startsWith('image/')"
                    :src="file.blobUrl || file.url || anyUrlToBlobUrl(file.url)" class="preview-file" />

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