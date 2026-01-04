<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue?: AgentBackground[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AgentBackground[]]
}>()

const backgrounds = ref<AgentBackground[]>(props.modelValue || [])
const fileUploadRef = ref<any>(null)

const handleFilesSelected = async (files: any[]) => {
  try {
    const fileData = await Promise.all(files.map(async file => {
      const response = await fetch(file.blobUrl || file.url)
      const blob = await response.blob()
      const buffer = await blob.arrayBuffer()
      return {
        name: `${Date.now()}-${file.filename || file.name}`,
        buffer
      }
    }))

    const savedFiles = await saveFilesToUserData(fileData)

    const newBackgrounds: AgentBackground[] = savedFiles.map((f, index) => ({
      type: files[index].mediaType?.startsWith('video/') ? 'video' : 'image',
      url: `file://${f.path}`
    }))

    backgrounds.value = [...backgrounds.value, ...newBackgrounds]
    emit('update:modelValue', backgrounds.value)
  } catch (error) {
    console.error('Failed to save background files:', error)
  }
}

const removeBackground = (index: number) => {
  backgrounds.value.splice(index, 1)
  emit('update:modelValue', backgrounds.value)
}

const triggerUpload = () => {
  fileUploadRef.value?.triggerUpload()
}
</script>

<template>
  <div class="background-manager">
    <div class="background-list">
      <div v-for="(bg, index) in backgrounds" :key="index" class="background-item">
        <div class="preview-container">
          <img v-if="bg.type === 'image'" :src="anyUrlToBlobUrl(bg.url)" class="preview-media" />
          <video v-else :src="anyUrlToBlobUrl(bg.url)" class="preview-media" muted />
          <div class="type-badge">{{ bg.type === 'video' ? '视频' : '图片' }}</div>
        </div>
        <button class="remove-btn" @click="removeBackground(index)">
          <component :is="useIcon('Trash')" />
        </button>
      </div>

      <div class="upload-box" @click="triggerUpload">
        <component :is="useIcon('Plus')" class="upload-icon" />
        <span>上传</span>
      </div>
    </div>

    <FileUpload
      ref="fileUploadRef"
      @files-selected="handleFilesSelected"
      :removable="false"
      class="hidden-upload"
    />

    <div class="hint">支持上传多张图片或多个视频，将循环播放</div>
  </div>
</template>

<style scoped>
.background-manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.background-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.background-item, .upload-box {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.background-item {
  border: 1px solid var(--border-color);
  background: var(--bg-hover);
}

.preview-container {
  width: 100%;
  height: 100%;
}

.preview-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.type-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff4d4f;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: #ff4d4f;
  color: white;
}

.upload-box {
  border: 1px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
  background: var(--bg-card);
  box-sizing: border-box;
}

.upload-box:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--bg-hover);
}

.upload-box .upload-icon {
  width: 24px;
  height: 24px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-box span {
  font-size: 12px;
  color: var(--text-secondary);
}

.hidden-upload {
  display: none;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
