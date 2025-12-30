<script setup lang="ts">
const selectedModelId = defineModel<string>('modelId', { default: '' })
const selectedProviderId = defineModel<string>('providerId', { default: '' })

const props = withDefaults(
  defineProps<{
    type?: 'icon' | 'select'
    popupPosition?: 'top' | 'bottom'
    category?: ModelCategory
  }>(),
  {
    type: 'select',
    category: 'text'
  }
)
const { providers } = storeToRefs(useSettingsStore())

const currentSelectedModel = computed(() => {
  if (!selectedModelId.value || !selectedProviderId.value) return null

  const provider = providers.value.find((p) => p.id === selectedProviderId.value)
  return provider?.models?.find((m) => m.id === selectedModelId.value) || null
})

const currentSelectedProvider = computed(() => {
  return providers.value.find((p) => p.id === selectedProviderId.value) || null
})

const isPopupOpen = ref(false)
const searchQuery = ref('')
const { ChevronDown, Check, Close } = useIcon(['ChevronDown', 'Check', 'Close'])

const currentModelLabel = computed(() => {
  if (!currentSelectedModel.value || !currentSelectedProvider.value) return '选择模型'
  return currentSelectedModel.value?.name || '选择模型'
})

const filteredModels = computed(() => {
  const result: { provider: Provider; models: Model[] }[] = []
  providers.value.forEach((provider) => {
    const filteredModels = provider.models?.filter(
      (model) => model.active && model.category === props.category
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
const searchModels = computed(() => {
  const query = searchQuery.value.toLowerCase()
  return flatModelList.value.filter(
    (item) =>
      item.model.name.toLowerCase().includes(query) || item.model.id.toLowerCase().includes(query)
  )
})
const selectModel = (model: Model, providerId: string) => {
  selectedModelId.value = model.id
  selectedProviderId.value = providerId
  isPopupOpen.value = false
}

const clearSelection = () => {
  selectedModelId.value = ''
  selectedProviderId.value = ''
  isPopupOpen.value = false
}

const renderProviderHeader = (item: any) => {
  const provider = providers.value.find((p) => p.id === item.providerId)
  return provider ? provider.name : ''
}

const isModelSelected = (item: any) => {
  return item.id === selectedModelId.value
}

const handleModelSelect = (id: string) => {
  const item = flatModelList.value.find((item) => item.model.id === id)
  if (item) selectModel(item.model, item.providerId)
}
</script>

<template>
  <SelectorPopover v-model:visiable="isPopupOpen" :data="flatModelList" v-model:searchQuery="searchQuery"
    placeholder="搜索模型..." noResultsText="未找到模型" :hasResults="filteredModels.length > 0" width="240px" title="选择模型"
    :position="popupPosition || 'top'">
    <template #trigger>
      <div v-if="type === 'select'" class="model-btn" :class="{ active: isPopupOpen }">
        <div class="model-btn-content">
          <Image v-if="selectedModelId" style="width: 10px; border-radius: 2px" :src="currentSelectedProvider?.logo"
            alt="" />
          <span>{{ currentModelLabel }}</span>
        </div>
        <ChevronDown v-if="!selectedModelId" />
        <Close v-else class="clear-btn" @click.stop="clearSelection" />
      </div>
      <Button v-else variant="icon" size="sm">
        <Image style="width: 15px; border-radius: 2px" :src="currentSelectedProvider?.logo" alt="" />
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
        }" v-if="item.id === selectedModelId" />
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
