<script setup lang="ts">
interface Props {
  modelValue?: string | string[]
  files?: Array<UploadFile>
  multiple?: boolean
  removable?: boolean
  showUpload?: boolean
  dropZoneRef?: HTMLElement
  inputRef?: HTMLTextAreaElement
  onRemove?: (index: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  multiple: true,
  removable: true,
  showUpload: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
  remove: [index: number]
  filesSelected: [files: Array<UploadFile>]
}>()

// 统一处理初始文件列表
const initialFiles = computed(() => {
  if (props.files) return props.files
  const value = props.modelValue
  if (!value) return []
  const urls = Array.isArray(value) ? value : [value]
  return urls.map((url) => ({
    url,
    mediaType: 'image/jpeg',
    type: 'file' as const
  }))
})

// 监听外部数据变化并同步到内部状态
watch(() => [props.files, props.modelValue], () => {
  selectedFiles.value = initialFiles.value
}, { deep: true })

const {
  selectedFiles,
  uploadLoading,
  isDragOver,
  isOverDropZone,
  removeFile,
  triggerUpload,
  handlePaste
} = useUpload({
  files: initialFiles.value,
  dropZoneRef: ref(props.dropZoneRef),
  inputRef: ref(props.inputRef),
  onFilesSelected: (files) => {
    let newValue: string | string[]
    if (props.multiple) {
      const urls = selectedFiles.value.map((f) => f.path || f.url || '')
      newValue = urls
    } else {
      const lastFile = files[files.length - 1]
      const url = lastFile.path || lastFile.url || ''
      selectedFiles.value = [lastFile]
      newValue = url
    }
    emit('update:modelValue', newValue)
    emit('filesSelected', files as Array<UploadFile>)
  },
  onRemove: (index) => {
    if (props.onRemove) {
      props.onRemove(index)
    } else {
      emit('remove', index)
    }
    const urls = selectedFiles.value.map((f) => f.url || f.blobUrl || '')
    emit('update:modelValue', props.multiple ? urls : urls[0] || '')
  }
})

const handleRemove = (index: number) => {
  removeFile(index)
}

const handleTriggerUpload = () => {
  // 智能体头像和背景图强制使用用户数据目录
  triggerUpload(true)
}

const showAddButton = computed(() => {
  if (!props.showUpload) return false
  if (props.multiple) return true
  return selectedFiles.value.length === 0
})

const { Plus } = useIcon(['Plus'])

const getIcon = (file: UploadFile) => {
  return useIcon(getFileIcon(file))
}

// 暴露给父组件的方法和状态
defineExpose({
  selectedFiles,
  isDragOver,
  isOverDropZone,
  triggerUpload,
  handlePaste
})
</script>

<template>
  <div class="file-upload-preview" :class="{ 'drag-over': isDragOver || isOverDropZone }">
    <!-- 文件预览区域 -->
    <div class="file-preview-container">
      <div v-for="(file, index) in selectedFiles" :key="index" class="file-preview-item">
        <Image
          v-if="file.mediaType?.startsWith?.('image/') || !file.mediaType"
          :src="file.blobUrl || anyUrlToBlobUrl(file.url)"
          :images="selectedFiles.map(f => f.blobUrl || anyUrlToBlobUrl(f.url))"
          :initial-index="index"
          class="preview-file"
          preview
        />

        <div v-else class="preview-generic">
          <div class="generic-icon">
            <component :is="getIcon(file)" />
          </div>
          <span class="file-name" :title="file.filename">{{ file.filename }}</span>
        </div>

        <button v-if="removable" class="remove-file-btn" @click.stop="handleRemove(index)">×</button>
      </div>

      <!-- 添加按钮 -->
      <div v-if="showAddButton" class="upload-box" :class="{ 'uploading': uploadLoading }" @click="!uploadLoading && handleTriggerUpload()">
        <template v-if="uploadLoading">
          <div class="btn-spinner"></div>
        </template>
        <template v-else>
          <Plus class="upload-icon" />
          <span>上传</span>
        </template>
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
  width: 100%;
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
  border: 1px solid var(--border-color);
  background: var(--bg-hover);
  box-sizing: border-box;
}

.preview-file {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-box {
  width: 80px;
  height: 80px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
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

.upload-box.uploading {
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.upload-icon {
  width: 20px;
  height: 20px;
  color: var(--text-primary);
}

.upload-box span {
  font-size: 12px;
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
  color: var(--text-secondary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-name {
  font-size: 10px;
  color: var(--text-primary);
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  transition: background 0.2s;
  z-index: 10;
}

.remove-file-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.drag-over {
  border-color: var(--accent-color);
  background-color: rgba(var(--accent-rgb), 0.05);
}
</style>
