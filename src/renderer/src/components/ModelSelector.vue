<script setup lang="ts">

const selectedModelId = defineModel<string>('modelId', { default: '' })
const selectedProviderId = defineModel<string>('providerId', { default: '' })

const props = withDefaults(defineProps<{
  type: 'icon' | 'select',
  popupPosition?: 'top' | 'bottom'
  category?: ModelCategory
}>(), {
  type: 'select',
  category: 'text'
})
const { providers } = storeToRefs(useSettingsStore())

const currentSelectedModel = computed(() => {
  if (!selectedModelId.value || !selectedProviderId.value) return null

  const provider = providers.value.find(p => p.id === selectedProviderId.value)
  return provider?.models?.find(m => m.id === selectedModelId.value) || null
})

const currentSelectedProvider = computed(() => {
  return providers.value.find(p => p.id === selectedProviderId.value) || null
})

const isPopupOpen = ref(false)
const searchQuery = ref('')
const { ChevronDown, Check } = useIcon(['ChevronDown', 'Check'])

const currentModelLabel = computed(() => {
  if (!currentSelectedModel.value || !currentSelectedProvider.value) return '选择模型'
  return currentSelectedModel.value?.name || '选择模型'
})

const filteredModels = computed(() => {
  const query = searchQuery.value.toLowerCase()
  const result: { provider: Provider, models: Model[] }[] = []
  providers.value.forEach(provider => {
    const filteredModels = provider.models?.filter(model =>
      (model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query)) && model.active && model.category === props.category
    )
    if (filteredModels?.length > 0) {
      result.push({ provider, models: filteredModels })
    }
  })
  return result
})

const flatModelList = computed(() => {
  const result: { model: Model, providerId: string }[] = []

  filteredModels.value.forEach(({ provider, models }) => {
    models.forEach(model => {
      result.push({ model, providerId: provider.id })
    })
  })

  return result
})

const selectModel = (model: Model, providerId: string) => {
  selectedModelId.value = model.id
  selectedProviderId.value = providerId
  isPopupOpen.value = false
}

const renderProviderHeader = (item: any) => {
  const provider = providers.value.find(p => p.id === item.providerId)
  return provider ? provider.name : ''
}

const isModelSelected = (item: any) => {
  return item.id === selectedModelId.value
}

const handleModelSelect = (id: string) => {
  const item = flatModelList.value.find(item => item.model.id === id)
  if (item) selectModel(item.model, item.providerId)
}
</script>

<template>
  <SelectorPopover v-model="isPopupOpen" v-model:searchQuery="searchQuery" placeholder="搜索模型..." noResultsText="未找到模型"
    :hasResults="filteredModels.length > 0" width="240px" :position="popupPosition || 'top'">
    <template #trigger>
      <div v-if="type === 'select'" class="model-btn" :class="{ active: isPopupOpen }">
        <Image style="width: 10px;border-radius: 2px;" :src="currentSelectedProvider?.logo" alt="" />
        <span>{{ currentModelLabel }}</span>
        <ChevronDown />
      </div>
      <Button v-else variant="icon" size="sm">
        <Image style="width: 15px;border-radius: 2px;" :src="currentSelectedProvider?.logo" alt="" />
      </Button>
    </template>

    <!-- 扁平化的模型列表，用于统一List组件 -->
    <List type="ungap" :items="flatModelList.map(item => ({
      ...item.model,
      providerId: item.providerId
    }))" :key-field="'id'" :main-field="'name'" :sub-field="'description'" :show-header="true"
      :render-header="renderProviderHeader" :selectable="true" :is-selected="isModelSelected"
      @select="handleModelSelect">
      <template #actions="{ item }">
        <Check :style="{
          fontSize: '12px',
          color: '#fff',
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
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  transition: all 0.2s;
}

.model-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.model-btn.active {
  background: #e5e5e5;
}

/* 调整模型列表的大小 */
:deep(.mode-ungap) {
  /* 设置自定义的选中项背景颜色 */
  --bg-active: #000000;
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
  background-color: rgba(0, 0, 0, 0.05) !important;
}

:deep(.list-item.is-active) {
  background: #000000 !important;
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