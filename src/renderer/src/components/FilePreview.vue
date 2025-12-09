<script setup lang="ts">
import { FileUIPart } from 'ai';

interface Props {
    files?: Array<FileUIPart & { blobUrl?: string; name?: string }>;
    src?: string;
    alt?: string;
    removable?: boolean;
    showContainer?: boolean;
    onRemove?: (index: number) => void;
}

const props = withDefaults(defineProps<Props>(), {
    removable: false,
    showContainer: true
});

const emit = defineEmits<{
    remove: [index: number];
}>();

const handleRemove = (index: number) => {
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
    const fileName = file.name || '';
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
</script>

<template>
    <div :class="showContainer ? 'file-preview-container' : ''">
        <div v-for="(file, index) in files" :key="index" class="file-preview-item" @dblclick="handleOpen(file)">
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
</template>

<style scoped>
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
</style>