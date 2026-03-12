<script setup lang="ts">
import { assetsHandler } from '@renderer/utils'

type FlatModelItem = {
  model: Model
  providerId: string
  nameLower: string
  idLower: string
}

type ListModelItem = Model & { providerId: string }

const selectedModelId = defineModel<any>('modelId', { default: '' })
const selectedProviderId = defineModel<any>('providerId', { default: '' })
const router = useRouter()

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
const { getAllProviders } = storeToRefs(useSettingsStore())

const providerById = computed(() => {
  const map = new Map<string, Provider>()
  getAllProviders.value.forEach((provider) => {
    map.set(provider.id, provider)
  })
  return map
})

const providerNameById = computed(() => {
  const map = new Map<string, string>()
  getAllProviders.value.forEach((provider) => {
    map.set(provider.id, provider.name)
  })
  return map
})

const selectedPairSet = computed(() => {
  const set = new Set<string>()
  if (!props.multiple) return set
  const modelIds = Array.isArray(selectedModelId.value) ? selectedModelId.value : []
  const providerIds = Array.isArray(selectedProviderId.value) ? selectedProviderId.value : []
  modelIds.forEach((modelId, index) => {
    const providerId = providerIds[index]
    if (typeof modelId === 'string' && typeof providerId === 'string') {
      set.add(`${providerId}::${modelId}`)
    }
  })
  return set
})

const isSelected = (modelId: string, providerId: string) => {
  if (props.multiple) {
    return selectedPairSet.value.has(`${providerId}::${modelId}`)
  }
  return selectedModelId.value === modelId && selectedProviderId.value === providerId
}

const currentSelectedModel = computed(() => {
  if (props.multiple) return null
  if (!selectedModelId.value || !selectedProviderId.value) return null

  const provider = providerById.value.get(selectedProviderId.value)
  return provider?.models?.find((m) => m.id === selectedModelId.value) || null
})

const currentSelectedProvider = computed(() => {
  if (props.multiple) return null
  return providerById.value.get(selectedProviderId.value) || null
})

const modelLogoLoadFailed = ref(false)
const currentSelectedProviderLogo = computed(() => {
  const logo = currentSelectedProvider.value?.logo
  return logo ? assetsHandler(logo) : ''
})

watch(currentSelectedProviderLogo, () => {
  modelLogoLoadFailed.value = false
})

const isPopupOpen = ref(false)
const searchQuery = ref('')
const { ChevronDown, Check, Close, Box, Settings } = useIcon([
  'ChevronDown',
  'Check',
  'Close',
  'Box',
  'Settings'
])

const currentModelLabel = computed(() => {
  if (props.multiple) {
    const count = Array.isArray(selectedModelId.value) ? selectedModelId.value.length : 0
    return count > 0 ? `已选 ${count} 个模型` : '选择模型'
  }
  if (!currentSelectedModel.value || !currentSelectedProvider.value) return '选择模型'
  return currentSelectedModel.value?.name || '选择模型'
})

const categorySet = computed(() => {
  const categories = Array.isArray(props.category) ? props.category : [props.category]
  return new Set(categories)
})

const filteredModels = computed(() => {
  const result: { provider: Provider; models: Model[] }[] = []
  getAllProviders.value.forEach((provider) => {
    const filteredModels = provider.models?.filter(
      (model) => model.active && categorySet.value.has(model.category as ModelCategory)
    )
    if (filteredModels?.length > 0) {
      result.push({ provider, models: filteredModels })
    }
  })
  return result
})

const flatModelList = computed(() => {
  const result: FlatModelItem[] = []

  filteredModels.value.forEach(({ provider, models }) => {
    models.forEach((model) => {
      result.push({
        model,
        providerId: provider.id,
        nameLower: model.name.toLowerCase(),
        idLower: model.id.toLowerCase()
      })
    })
  })

  return result
})

const flatModelById = computed(() => {
  const map = new Map<string, FlatModelItem>()
  flatModelList.value.forEach((item) => {
    if (!map.has(item.model.id)) {
      map.set(item.model.id, item)
    }
  })
  return map
})

// 如果当前选择的模型不在列表中，则清空选择
watch(
  [flatModelList, selectedModelId, selectedProviderId],
  ([newList, currentId, currentProviderId]) => {
    if (props.multiple) return // 多选模式暂时不自动清理，逻辑较复杂
    if (
      currentId &&
      currentProviderId &&
      typeof currentId === 'string' &&
      typeof currentProviderId === 'string'
    ) {
      const exists = newList.some(
        (item) => item.model.id === currentId && item.providerId === currentProviderId
      )
      if (!exists) {
        selectedModelId.value = ''
        selectedProviderId.value = ''
      }
    }
  },
  { immediate: true }
)

const searchModels = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return flatModelList.value
  return flatModelList.value.filter((item) => item.nameLower.includes(query) || item.idLower.includes(query))
})

const listItems = computed<ListModelItem[]>(() =>
  searchModels.value.map((item) => ({
    ...item.model,
    providerId: item.providerId
  }))
)

const selectModel = (model: Model, providerId: string) => {
  if (props.multiple) {
    const modelIds = Array.isArray(selectedModelId.value) ? [...selectedModelId.value] : []
    const providerIds = Array.isArray(selectedProviderId.value) ? [...selectedProviderId.value] : []

    let index = -1
    for (let i = 0; i < modelIds.length; i += 1) {
      if (modelIds[i] === model.id && providerIds[i] === providerId) {
        index = i
        break
      }
    }
    if (index > -1) {
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
  return providerNameById.value.get(item.providerId) || ''
}

const isModelSelected = (item: any) => {
  return isSelected(item.id, item.providerId)
}

const handleModelSelect = (id: string) => {
  const item = flatModelById.value.get(id)
  if (item) selectModel(item.model, item.providerId)
}

const openProviderSettings = (providerId: string) => {
  isPopupOpen.value = false
  if (isMobile.value) {
    router.push(`/mobile/settings/models/${providerId}`)
    return
  }
  router.push({
    path: '/settings',
    query: {
      tab: 'models',
      providerId
    }
  })
}

const handleModelLogoError = () => {
  modelLogoLoadFailed.value = true
}
</script>

<template>
  <SelectorPopover
    v-model:visible="isPopupOpen"
    :data="listItems"
    v-model:searchQuery="searchQuery"
    placeholder="搜索模型..."
    noResultsText="未找到模型"
    :hasResults="searchModels.length > 0"
    :search-debounce="120"
    width="240px"
    title="选择模型"
    :position="popupPosition || 'top'"
  >
    <template #trigger>
      <div v-if="type === 'select'" class="model-btn" :class="{ active: isPopupOpen }">
        <div class="model-btn-content">
          <img
            v-if="selectedModelId && currentSelectedProviderLogo && !modelLogoLoadFailed"
            style="width: 10px; border-radius: 2px"
            :src="currentSelectedProviderLogo"
            alt=""
            :draggable="false"
            class="model-logo"
            @error="handleModelLogoError"
          />
          <Box v-else-if="selectedModelId" style="font-size: 10px" />
          <span>{{ currentModelLabel }}</span>
        </div>
        <div class="model-btn-icons">
          <Close
            v-if="selectedModelId && !isPopupOpen"
            class="clear-btn"
            @click.stop="clearSelection"
          />
          <ChevronDown class="arrow-icon" />
        </div>
      </div>
      <Button v-else variant="icon" size="sm">
        <img
          v-if="selectedModelId && currentSelectedProviderLogo && !modelLogoLoadFailed"
          style="width: 15px; border-radius: 2px"
          :src="currentSelectedProviderLogo"
          alt=""
          :draggable="false"
          class="model-logo"
          @error="handleModelLogoError"
        />
        <Box v-else style="font-size: 16px" />
      </Button>
    </template>

    <List
      :items="listItems"
      :key-field="'id'"
      :main-field="'name'"
      :sub-field="'description'"
      :show-header="true"
      :render-header="renderProviderHeader"
      :selectable="true"
      :is-selected="isModelSelected"
      @select="handleModelSelect"
    >
      <template #group-header="{ title, item }">
        <div class="provider-header-row">
          <span>{{ title }}</span>
          <Button
            variant="icon"
            size="sm"
            class="provider-settings-btn"
            title="打开提供商设置"
            @click.stop="openProviderSettings(item.providerId)"
          >
            <template #icon>
              <Settings style="font-size: 12px" />
            </template>
          </Button>
        </div>
      </template>
      <template #actions="{ isActive }">
        <Check
          :style="{
            fontSize: '12px',
            color: 'var(--bg-card)'
          }"
          v-if="isActive"
        />
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
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
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

.model-logo {
  -webkit-touch-callout: none;
  user-select: none;
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
  transition: opacity 0.12s ease;
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

.provider-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.provider-settings-btn {
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  padding: 1px;
  border-radius: 3px;
}
</style>
