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
    removable: true,
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

const getBlobUrl = (url: string): string => {
    const blob = dataURLToBlob(url);
    return URL.createObjectURL(blob);
};

const displayFiles = computed(() => {
    if (props.files && props.files.length > 0) {
        return props.files;
    }
    if (props.src) {
        return [{ url: props.src, blobUrl: props.src, mediaType: 'image/', name: props.alt || 'image' }];
    }
    return [];
});
</script>

<template>
    <div :class="showContainer ? 'file-preview-container' : ''">
        <div v-for="(file, index) in displayFiles" :key="index" class="file-preview-item">
            <img v-if="file.mediaType?.startsWith('image/') || file.url?.startsWith('blob:') || file.url?.startsWith('data:')"
                :src="file.blobUrl || file.url || getBlobUrl(file.url)" class="preview-file" :alt="file.name || alt" />

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