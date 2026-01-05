<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const avatarUrl = ref<string>(props.modelValue || '')
const fileUploadRef = ref<any>(null)

const { Trash, Plus } = useIcon(['Trash', 'Plus'])

const handleFilesSelected = async (files: any[]) => {
  if (files.length === 0) return

  try {
    const file = files[0]
    const response = await fetch(file.blobUrl || file.url)
    const blob = await response.blob()
    const buffer = await blob.arrayBuffer()

    const savedFiles = await saveFilesToUserData([{
      name: `avatar-${Date.now()}-${file.filename || file.name}`,
      buffer
    }])

    if (savedFiles.length > 0) {
      avatarUrl.value = `file://${savedFiles[0].path}`
      emit('update:modelValue', avatarUrl.value)
    }
  } catch (error) {
    console.error('Failed to save avatar file:', error)
  }
}

const removeAvatar = () => {
  avatarUrl.value = ''
  emit('update:modelValue', '')
}

const triggerUpload = () => {
  fileUploadRef.value?.triggerUpload()
}
</script>

<template>
  <div class="avatar-upload">
    <div v-if="avatarUrl" class="avatar-preview">
      <Image :src="avatarUrl" class="preview-img" />
      <button class="remove-btn" @click.stop="removeAvatar">
        <Trash />
      </button>
    </div>
    <div v-else class="upload-box" @click="triggerUpload">
      <Plus class="upload-icon" />
      <span>上传头像</span>
    </div>

    <FileUpload
      ref="fileUploadRef"
      @files-selected="handleFilesSelected"
      :removable="false"
      class="hidden-upload"
    />
  </div>
</template>

<style scoped>
.avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-preview {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
}

.avatar-preview:hover .remove-btn {
  opacity: 1;
}

.upload-box {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  border: 1px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all 0.2s;
}

.upload-box:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--bg-hover);
}

.upload-icon {
  font-size: 20px;
}

.upload-box span {
  font-size: 10px;
}

.hidden-upload {
  display: none;
}
</style>
