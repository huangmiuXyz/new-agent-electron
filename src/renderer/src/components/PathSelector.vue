<script setup lang="ts">
interface Props {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  size?: 'md' | 'sm'
  // 文件选择器选项
  dialogOptions?: {
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>
    filters?: Array<{ name: string; extensions: string[] }>
    title?: string
    defaultPath?: string
  }
}

const modelValue = defineModel<string>()
const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  readonly: false,
  size: 'md',
  dialogOptions: () => ({
    properties: ['openDirectory']
  })
})

const emit = defineEmits(['blur', 'focus'])

const handleBlur = (event: FocusEvent) => {
  emit('blur', event)
}

const handleFocus = (event: FocusEvent) => {
  emit('focus', event)
}

// 打开文件选择器
const handleSelectPath = async () => {
  if (props.disabled) return

  try {
    const result = await window.api.showOpenDialog(props.dialogOptions)
    if (!result.canceled && result.filePaths.length > 0) {
      modelValue.value = result.filePaths[0]
    }
  } catch (error) {
    console.error('Failed to open file dialog:', error)
  }
}

const inputRef = useTemplateRef('inputRef')

defineExpose({
  focus: () => {
    inputRef.value?.focus()
  }
})
</script>

<template>
  <div class="path-selector-wrapper">
    <Input
      ref="inputRef"
      v-model="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :size="size"
      class="path-selector-input"
      @blur="handleBlur"
      @focus="handleFocus"
    />
    <Button
      variant="secondary"
      :size="size"
      :disabled="disabled"
      class="path-selector-button"
      @click="handleSelectPath"
    >
      <template #icon>
        <component :is="useIcon('Folder')" />
      </template>
    </Button>
  </div>
</template>

<style scoped>
.path-selector-wrapper {
  display: flex;
  gap: 4px;
  width: 100%;
}

.path-selector-input {
  flex: 1;
}

.path-selector-button {
  flex-shrink: 0;
}
</style>