<script setup lang="ts">
import { FileUIPart } from 'ai';

interface Props {
    files?: Array<FileUIPart & { blobUrl?: string; name?: string }>;
    imageSrc?: string;
    alt?: string;
    removable?: boolean;
    previewMode?: 'input' | 'content';
    onRemove?: (index: number) => void;
}

const props = withDefaults(defineProps<Props>(), {
    removable: true,
    previewMode: 'input'
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

const getBlobUrl = (url: string): string => {
    const blob = dataURLToBlob(url);
    return URL.createObjectURL(blob);
};
</script>

<template>
    <!-- 输入模式的图片预览 -->
    <div v-if="previewMode === 'input' && files" class="file-preview-container">
        <div v-for="(file, index) in files" :key="index" class="file-preview-item">
            <img v-if="file.mediaType?.startsWith('image/')" :src="file.blobUrl || file.url" class="preview-file"
                :alt="file.name" />

            <div v-else class="preview-generic">
                <div class="generic-icon">
                    <component :is="useIcon('FileText')" v-if="useIcon('FileText')" />
                    <span v-else>📄</span>
                </div>
                <span class="file-name" :title="file.name">{{ file.name }}</span>
            </div>

            <button v-if="removable" class="remove-file-btn" @click="handleRemove(index)">×</button>
        </div>
    </div>

    <!-- 内容模式的图片预览 -->
    <div v-else-if="previewMode === 'content'" class="image-container">
        <img :src="imageSrc || (files && files[0] ? (files[0].blobUrl || files[0].url || getBlobUrl(files[0].url)) : '')"
            :alt="alt || '图片'" class="msg-image" />
    </div>
</template>

<style scoped>
.file-preview-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
    padding-top: 0;
    border-bottom: 1px solid #f5f5f5;
    margin-bottom: 8px;
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

.image-container {
    display: inline-block;
}

.msg-image {
    height: 100px;
    border-radius: 8px;
    margin: 8px 0;
    border: 1px solid #e5e7eb;
    display: block;
}
</style>