<script setup lang="ts">
import type { ImageBatch } from '@renderer/stores/image'
import VideoPlayer from '@renderer/components/VideoPlayer.vue'

const props = defineProps<{
  batch: ImageBatch
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'reEdit', batch: ImageBatch): void
  (e: 'delete', batchId: number): void
  (e: 'copyPrompt', prompt: string): void
}>()

const { Trash, Edit, Copy, X } = useIcon(['Trash', 'Download', 'Edit', 'Copy', 'X'])

const handleReEdit = () => {
  emit('reEdit', props.batch)
}

const handleDelete = () => {
  emit('delete', props.batch.id)
}

const handleCopyPrompt = () => {
  emit('copyPrompt', props.batch.prompt)
}
</script>

<template>
  <Card padding="20px" radius="16px" class="generation-results">
    <div class="prompt-card">
      <div class="prompt-header">
        <div class="prompt-content">
          <span class="prompt-label">提示词</span>
          <p class="prompt-text">{{ batch.prompt }}</p>
        </div>
        <div v-if="!readonly" class="prompt-actions">
          <Button variant="icon" size="sm" title="复制提示词" @click="handleCopyPrompt">
            <Copy />
          </Button>
          <Button variant="icon" size="sm" title="重新编辑" @click="handleReEdit">
            <Edit />
          </Button>
          <Button variant="icon" size="sm" class="delete-btn" title="删除批次" @click="handleDelete">
            <Trash />
          </Button>
        </div>
      </div>
      <div class="prompt-meta">
        <Tags v-if="batch.modelName" :tags="[batch.modelName]" color="blue" />
        <Tags v-if="batch.size" :tags="[`分辨率 ${batch.size}`]" color="green" />
      </div>
    </div>

    <div class="image-grid">
      <div v-for="(img, index) in batch.images" :key="index" class="image-item"
        :class="{ 'video-item': batch.mediaType === 'video' }">
        <template v-if="typeof img === 'object' && img.loading">
          <div class="image-loading" :class="{ 'is-failed': batch.status === 'failed' }">
            <template v-if="batch.status === 'failed'">
              <div class="error-icon">
                <X />
              </div>
              <span class="error-text">生成失败</span>
              <p v-if="batch.error" class="error-detail" :title="batch.error">{{ batch.error }}</p>
            </template>
            <template v-else>
              <div class="loading-spinner"></div>
              <span>{{ batch.mediaType === 'video' ? '视频生成中...' : '生成中...' }}</span>
            </template>
          </div>
        </template>
        <template v-else>
          <!-- 视频显示 -->
          <template v-if="batch.mediaType === 'video'">
            <VideoPlayer :src="(img as string)" />
          </template>
          <!-- 图片显示 -->
          <template v-else>
            <Image :src="(img as string)" preview
              :images="(batch.images.filter(i => typeof i === 'string') as string[])"
              :initial-index="batch.images.filter((i, idx) => typeof i === 'string' && idx <= index).length - 1" />
          </template>
        </template>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.generation-results {
  width: 100%;
}

.prompt-card {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.prompt-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.prompt-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.prompt-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  font-weight: 500;
}

.prompt-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.generation-results:hover .prompt-actions {
  opacity: 1;
}

.delete-btn:hover {
  color: var(--error-color, #ff4d4f) !important;
  background: rgba(255, 77, 79, 0.1) !important;
}

.prompt-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
}

.image-grid::-webkit-scrollbar {
  height: 6px;
}

.image-grid::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

.image-grid::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.image-grid::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.image-item {
  position: relative;
  flex-shrink: 0;
  width: 140px;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.image-item :deep(.n-image) {
  width: 100%;
  height: 100%;
}

.image-item :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s;
}

.video-item {
  width: 320px;
  height: 180px;
}

.image-loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  background: var(--bg-tertiary);
}

.image-loading.is-failed {
  color: var(--color-error);
  padding: 16px;
  text-align: center;
}

.error-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--color-error-rgb), 0.1);
  margin-bottom: 4px;
}

.error-text {
  font-weight: 600;
}

.error-detail {
  font-size: 11px;
  opacity: 0.8;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
