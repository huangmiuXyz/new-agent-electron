<script setup lang="ts">
const selectedModelId = defineModel<any>('modelId', { default: '' })
const selectedProviderId = defineModel<any>('providerId', { default: '' })

const props = withDefaults(
  defineProps<{
    type?: 'icon' | 'select'
    popupPosition?: 'top' | 'bottom'
    category?: ModelCategory | ModelCategory[]
    multiple?: boolean
  }>(),
  {
    type: 'select',
    category: 'text',
    multiple: false
  }
)
const { providers, getAllProviders } = storeToRefs(useSettingsStore())

const isSelected = (modelId: string, providerId: string) => {
  if (props.multiple) {
    const modelIds = Array.isArray(selectedModelId.value) ? selectedModelId.value : []
    const providerIds = Array.isArray(selectedProviderId.value) ? selectedProviderId.value : []
    return modelIds.includes(modelId) && providerIds[modelIds.indexOf(modelId)] === providerId
  }
  return selectedModelId.value === modelId && selectedProviderId.value === providerId
}

const currentSelectedModel = computed(() => {
  if (props.multiple) return null
  if (!selectedModelId.value || !selectedProviderId.value) return null

  const provider = getAllProviders.value.find((p) => p.id === selectedProviderId.value)
  return provider?.models?.find((m) => m.id === selectedModelId.value) || null
})

const currentSelectedProvider = computed(() => {
  if (props.multiple) return null
  return getAllProviders.value.find((p) => p.id === selectedProviderId.value) || null
})

const isPopupOpen = ref(false)
const searchQuery = ref('')
const { ChevronDown, Check, Close, Box } = useIcon([
  'ChevronDown',
  'Check',
  'Close',
  'Box'
])

const currentModelLabel = computed(() => {
  if (props.multiple) {
    const count = Array.isArray(selectedModelId.value) ? selectedModelId.value.length : 0
    return count > 0 ? `已选 ${count} 个模型` : '选择模型'
  }
  if (!currentSelectedModel.value || !currentSelectedProvider.value) return '选择模型'
  return currentSelectedModel.value?.name || '选择模型'
})

const filteredModels = computed(() => {
  const result: { provider: Provider; models: Model[] }[] = []
  const categories = Array.isArray(props.category) ? props.category : [props.category]
  getAllProviders.value.forEach((provider) => {
    const filteredModels = provider.models?.filter(
      (model) => model.active && categories.includes(model.category as ModelCategory)
    )
    if (filteredModels?.length > 0) {
      result.push({ provider, models: filteredModels })
    }
  })
  return result
})

const flatModelList = computed(() => {
  const result: { model: Model; providerId: string }[] = []

  filteredModels.value.forEach(({ provider, models }) => {
    models.forEach((model) => {
      result.push({ model, providerId: provider.id })
    })
  })

  return result
})

// 如果当前选择的模型不在列表中，则清空选择
watch(
  [flatModelList, selectedModelId],
  ([newList, currentId]) => {
    if (props.multiple) return // 多选模式暂时不自动清理，逻辑较复杂
    if (currentId && typeof currentId === 'string') {
      const exists = newList.some((item) => item.model.id === currentId)
      if (!exists) {
        selectedModelId.value = ''
        selectedProviderId.value = ''
      }
    }
  },
  { immediate: true }
)

const searchModels = computed(() => {
  const query = searchQuery.value.toLowerCase()
  return flatModelList.value.filter(
    (item) =>
      item.model.name.toLowerCase().includes(query) || item.model.id.toLowerCase().includes(query)
  )
})
const selectModel = (model: Model, providerId: string) => {
  if (props.multiple) {
    const modelIds = Array.isArray(selectedModelId.value) ? [...selectedModelId.value] : []
    const providerIds = Array.isArray(selectedProviderId.value) ? [...selectedProviderId.value] : []

    const index = modelIds.indexOf(model.id)
    if (index > -1 && providerIds[index] === providerId) {
      modelIds.splice(index, 1)
      providerIds.splice(index, 1)
    } else {
      modelIds.push(model.id)
      providerIds.push(providerId)
    }
    selectedModelId.value = modelIds
    selectedProviderId.value = providerIds
  } else {
    selectedModelId.value = model.id
    selectedProviderId.value = providerId
    isPopupOpen.value = false
  }
}

const clearSelection = () => {
  if (props.multiple) {
    selectedModelId.value = []
    selectedProviderId.value = []
  } else {
    selectedModelId.value = ''
    selectedProviderId.value = ''
  }
  isPopupOpen.value = false
}

const renderProviderHeader = (item: any) => {
  const provider = providers.value.find((p) => p.id === item.providerId)
  return provider ? provider.name : ''
}

const isModelSelected = (item: any) => {
  return isSelected(item.id, item.providerId)
}

const handleModelSelect = (id: string) => {
  const item = flatModelList.value.find((item) => item.model.id === id)
  if (item) selectModel(item.model, item.providerId)
}
</script>

<template>
  <SelectorPopover v-model:visible="isPopupOpen" :data="flatModelList" v-model:searchQuery="searchQuery"
    placeholder="搜索模型..." noResultsText="未找到模型" :hasResults="filteredModels.length > 0" width="240px" title="选择模型"
    :position="popupPosition || 'top'">
    <template #trigger>
      <div v-if="type === 'select'" class="model-btn" :class="{ active: isPopupOpen }">
        <div class="model-btn-content">
          <Image v-if="selectedModelId && currentSelectedProvider?.logo" style="width: 10px; border-radius: 2px"
            :src="currentSelectedProvider?.logo" alt="" />
          <Box v-else-if="selectedModelId" style="font-size: 10px;" />
          <span>{{ currentModelLabel }}</span>
        </div>
        <div class="model-btn-icons">
          <Close v-if="selectedModelId && !isPopupOpen" class="clear-btn" @click.stop="clearSelection" />
          <ChevronDown class="arrow-icon" />
        </div>
      </div>
      <Button v-else variant="icon" size="sm">
        <Image v-if="selectedModelId && currentSelectedProvider?.logo" style="width: 15px; border-radius: 2px"
          :src="currentSelectedProvider?.logo" alt="" />
        <Box v-else style="font-size: 16px;" />
      </Button>
    </template>

    <List :items="searchModels.map((item) => ({
      ...item.model,
      providerId: item.providerId
    }))
      " :key-field="'id'" :main-field="'name'" :sub-field="'description'" :show-header="true"
      :render-header="renderProviderHeader" :selectable="true" :is-selected="isModelSelected"
      @select="handleModelSelect">
      <template #actions="{ item }">
        <Check :style="{
          fontSize: '12px',
          color: 'var(--bg-card)'
        }" v-if="isSelected(item.id, item.providerId)" />
      </template>
    </List>
  </SelectorPopover>
</template>

<style scoped>
.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  justify-content: space-between;
  transition: all 0.2s;
  height: 32px;
}

.model-btn-content {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.model-btn-content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-btn-icons {
  display: flex;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

.clear-btn {
  position: absolute;
  right: 0;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s;
  background: var(--bg-hover);
  border-radius: 4px;
}

.model-btn:hover .clear-btn {
  opacity: 1;
  pointer-events: auto;
}

.model-btn:hover .arrow-icon {
  opacity: 0;
}

.arrow-icon {
  transition: opacity 0.2s;
}

.model-btn:hover {
  background: var(--bg-hover);
}

.model-btn.active {
  background: var(--bg-hover);
}

/* 调整模型列表的大小 */
:deep(.mode-ungap) {
  /* 设置自定义的选中项背景颜色 */
  --bg-active: var(--accent-color);
  /* 确保圆角正确应用 */
  border-radius: 10px;
  overflow: hidden;
}

:deep(.list-item) {
  padding: 6px 8px;
  background-color: transparent;
  border-radius: 6px !important;
  margin-bottom: 1px !important;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover) !important;
}

:deep(.list-item.is-active) {
  background: var(--accent-color) !important;
  color: var(--bg-card) !important;
}

:deep(.main-text) {
  font-size: 12px;
}

:deep(.sub-text) {
  font-size: 10px;
}

:deep(.group-header) {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding: 6px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
