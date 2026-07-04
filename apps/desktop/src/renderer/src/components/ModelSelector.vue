<script setup lang="ts">
import { assetsHandler } from '@renderer/utils'
import type { Component } from 'vue'
import MiniSearch from 'minisearch'
import { pinyin } from 'pinyin-pro'

const addPinyin = (text: string) => {
  if (!text) return text
  const initials = pinyin(text, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
  return initials ? `${text} ${initials}` : text
}

type FlatModelItem = {
  key: string
  model: Model
  providerId: string
  nameLower: string
  idLower: string
  providerNameLower: string
}

type ListModelItem = Model & { providerId: string; key: string }

const selectedModelId = defineModel<any>('modelId', { default: '' })
const selectedProviderId = defineModel<any>('providerId', { default: '' })
const emit = defineEmits<{
  select: [payload: { modelId: string; providerId: string }]
}>()
const router = useRouter()
const settingsStore = useSettingsStore()

const props = withDefaults(
  defineProps<{
    type?: 'icon' | 'select'
    popupPosition?: 'top' | 'bottom'
    category?: ModelCategory | ModelCategory[]
    multiple?: boolean
    icon?: Component
  }>(),
  {
    type: 'select',
    category: 'text',
    multiple: false
  }
)
const { getAllProviders, favoriteModelKeys } = storeToRefs(settingsStore)

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
const focusedKey = ref<string | null>(null)

const flatItems = computed(() => [...favoriteListItems.value, ...regularListItems.value])

const focusSearchInput = () => {
  const input = document.querySelector<HTMLElement>(
    '.selector-tray .search-input__field, .selector-tray .selector-search-input input'
  )
  input?.focus()
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isPopupOpen.value) return
  if ((e.target as HTMLElement).closest('.context-menu')) return
  if (!(e.target as HTMLElement).closest('.selector-tray')) return
  const items = flatItems.value
  if (items.length === 0) return
  const currentIdx = items.findIndex((i) => i.key === focusedKey.value)

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      {
        const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0
        focusedKey.value = items[nextIdx].key
      }
      focusSearchInput()
      break
    case 'ArrowUp':
      e.preventDefault()
      {
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1
        focusedKey.value = items[prevIdx].key
      }
      focusSearchInput()
      break
    case 'Enter':
      e.preventDefault()
      if (focusedKey.value) {
        handleModelSelect(focusedKey.value)
      }
      break
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

watch(isPopupOpen, (val) => {
  if (val) {
    nextTick(() => {
      const currentKey =
        selectedModelId.value && selectedProviderId.value
          ? settingsStore.createFavoriteModelKey(selectedProviderId.value, selectedModelId.value)
          : null
      const idx = currentKey ? flatItems.value.findIndex((i) => i.key === currentKey) : -1
      focusedKey.value = idx >= 0 ? flatItems.value[idx].key : flatItems.value[0]?.key || null
    })
  } else {
    focusedKey.value = null
  }
})

watch(focusedKey, (key) => {
  nextTick(() => {
    document.querySelectorAll('.selector-tray .list-item').forEach((el) => {
      el.classList.remove('keyboard-focused')
    })
    if (!key) return
    const idx = flatItems.value.findIndex((i) => i.key === key)
    if (idx < 0) return
    const items = document.querySelectorAll('.selector-tray .list-item')
    if (items[idx]) {
      items[idx].classList.add('keyboard-focused')
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
})
const { ChevronDown, Check, Close, Box, Settings } = useIcon([
  'ChevronDown',
  'Check',
  'Close',
  'Box',
  'Settings'
])

const iconTriggerComponent = computed(() => props.icon || null)

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
        key: settingsStore.createFavoriteModelKey(provider.id, model.id),
        model,
        providerId: provider.id,
        nameLower: model.name.toLowerCase(),
        idLower: model.id.toLowerCase(),
        providerNameLower: provider.name.toLowerCase()
      })
    })
  })

  return result
})

const flatModelById = computed(() => {
  const map = new Map<string, FlatModelItem>()
  flatModelList.value.forEach((item) => {
    if (!map.has(item.key)) {
      map.set(item.key, item)
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

const modelSearch = new MiniSearch({
  fields: ['name', 'id', 'providerName'],
  storeFields: ['key'],
  idField: 'key',
  searchOptions: { fuzzy: 0.2, prefix: true }
})

const rebuildModelIndex = (list: FlatModelItem[]) => {
  modelSearch.removeAll()
  modelSearch.addAll(
    list.map((item) => ({
      key: item.key,
      name: addPinyin(item.model.name),
      id: item.model.id,
      providerName: addPinyin(providerNameById.value.get(item.providerId) ?? '')
    }))
  )
}

onMounted(() => rebuildModelIndex(flatModelList.value))
watch(flatModelList, (list) => rebuildModelIndex(list))

const searchModels = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return flatModelList.value
  const results = modelSearch.search(query)
  const keys = new Set(results.map((r) => r.key))
  return flatModelList.value.filter((item) => keys.has(item.key))
})

const listItems = computed<ListModelItem[]>(() =>
  searchModels.value.map((item) => ({
    ...item.model,
    providerId: item.providerId,
    key: item.key
  }))
)

const favoriteModelKeySet = computed(() => new Set(favoriteModelKeys.value))

const favoriteListItems = computed(() =>
  listItems.value.filter((item) => favoriteModelKeySet.value.has(item.key))
)

const regularListItems = computed(() =>
  listItems.value.filter((item) => !favoriteModelKeySet.value.has(item.key))
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
    emit('select', { modelId: model.id, providerId })
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

const toggleFavoriteModel = (item: ListModelItem, event: MouseEvent) => {
  event.stopPropagation()
  settingsStore.toggleFavoriteModel(item.providerId, item.id)
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
  <div ref="modelSelectorWrapperRef">
  <SelectorPopover
    v-model:visible="isPopupOpen"
    :data="listItems"
    v-model:searchQuery="searchQuery"
    desktop-presentation="tray"
    placeholder="搜索模型..."
    noResultsText="未找到模型"
    :hasResults="listItems.length > 0"
    :search-debounce="120"
    width="380px"
    title="选择模型"
    :position="popupPosition || 'top'"
    tray-anchor=".input-container"
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
        <component :is="iconTriggerComponent" v-if="iconTriggerComponent" style="font-size: 16px" />
        <img
          v-else-if="selectedModelId && currentSelectedProviderLogo && !modelLogoLoadFailed"
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

    <div class="model-list-sections">
      <section v-if="favoriteListItems.length > 0" class="model-section">
        <div class="section-title">收藏</div>
        <List
          :items="favoriteListItems"
          :key-field="'key'"
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
          <template #actions="{ item, isActive }">
            <div class="model-item-actions">
              <button
                class="favorite-toggle"
                type="button"
                :class="{ active: favoriteModelKeySet.has(item.key) }"
                :title="favoriteModelKeySet.has(item.key) ? '取消收藏' : '收藏模型'"
                @click="toggleFavoriteModel(item, $event)"
              >★</button>
              <Check
                :style="{
                  fontSize: '12px',
                  color: 'var(--bg-card)'
                }"
                v-if="isActive"
              />
            </div>
          </template>
        </List>
      </section>

      <section v-if="regularListItems.length > 0" class="model-section">
        <div v-if="favoriteListItems.length > 0" class="section-title">全部</div>
        <List
          :items="regularListItems"
          :key-field="'key'"
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
          <template #actions="{ item }">
            <div class="model-item-actions">
              <button
                class="favorite-toggle"
                type="button"
                :class="{ active: favoriteModelKeySet.has(item.key) }"
                :title="favoriteModelKeySet.has(item.key) ? '取消收藏' : '收藏模型'"
                @click="toggleFavoriteModel(item, $event)"
              >★</button>
            </div>
          </template>
        </List>
      </section>
    </div>
  </SelectorPopover>
  </div>
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
}

:deep(.list-item) {
  background-color: transparent;
  border-radius: 6px !important;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover) !important;
}

:deep(.list-item.keyboard-focused) {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.07);
  border-radius: 6px !important;
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

.model-list-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-section {
  display: flex;
  flex-direction: column;
}

.section-title {
  padding: 8px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}

.model-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.favorite-toggle {
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 15px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.15s ease;
}

.favorite-toggle:hover {
  color: #f5b301;
  transform: scale(1.06);
}

.favorite-toggle.active {
  color: #f5b301;
}

:deep(.modal-body .mode-ungap) {
  background: transparent;
}

:deep(.modal-body .list-item) {
  padding: 10px 12px;
  border-radius: 10px !important;
  margin-bottom: 4px !important;
}

:deep(.modal-body .main-text) {
  font-size: 13px;
  font-weight: 600;
}

:deep(.modal-body .sub-text) {
  font-size: 11px;
}

:deep(.modal-body .group-header) {
  padding: 12px 8px 6px;
}

:deep(.modal-body .list-item.keyboard-focused) {
  box-shadow: 0 0 0 1px var(--accent-color);
  border-radius: 10px !important;
}
</style>
