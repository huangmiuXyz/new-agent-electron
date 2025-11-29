<script setup lang="ts">
const { currentSelectedModel, currentSelectedProvider, selectedModelId, selectedProviderId, providers } = storeToRefs(useSettingsStore())

// 模型选择器状态
const isPopupOpen = ref(false)
const searchQuery = ref('')
const modelListRef = ref<HTMLElement>()

// 计算属性
const currentModelLabel = computed(() => {
  if (!currentSelectedModel.value || !currentSelectedProvider.value) return '选择模型'

  return currentSelectedProvider.value?.name || '选择模型'
})

// 过滤后的模型列表
const filteredModels = computed(() => {
  const query = searchQuery.value.toLowerCase()
  const result: { provider: Provider, models: Model[] }[] = []
  providers.value.forEach(provider => {
    const filteredModels = provider.models.filter(model =>
      (model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query)) && model.active
    )
    if (filteredModels.length > 0) {
      result.push({ provider, models: filteredModels })
    }
  })
  return result
})

// 扁平化的模型列表
const flatModelList = computed(() => {
  const result: { model: Model, providerId: string }[] = []

  filteredModels.value.forEach(({ provider, models }) => {
    models.forEach(model => {
      result.push({ model, providerId: provider.id })
    })
  })

  return result
})

// 方法
const togglePopup = () => {
  isPopupOpen.value = !isPopupOpen.value
  if (isPopupOpen.value) {
    nextTick(() => {
      document.addEventListener('click', handleClickOutside)
    })
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
}

const closePopup = () => {
  isPopupOpen.value = false
  document.removeEventListener('click', handleClickOutside)
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.model-selector-wrapper')) {
    closePopup()
  }
}

const selectModel = (model: Model, providerId: string) => {
  selectedModelId.value = model.id
  selectedProviderId.value = providerId
  closePopup()
}

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 渲染分组标题的方法
const renderProviderHeader = (item: any) => {
  const provider = providers.value.find(p => p.id === item.providerId)
  return provider ? provider.name : ''
}

// 判断模型是否被选中的方法
const isModelSelected = (item: any) => {
  return item.id === selectedModelId.value
}

// 处理模型选择的方法
const handleModelSelect = (id: string) => {
  const item = flatModelList.value.find(item => item.model.id === id)
  if (item) selectModel(item.model, item.providerId)
}
</script>

<template>
  <div class="model-selector-wrapper">
    <div class="model-btn" @click="togglePopup">
      <span>{{ currentModelLabel }}</span>
      <i class="ph-bold ph-caret-down"></i>
    </div>

    <!-- 弹窗 -->
    <div class="model-popup" :class="{ show: isPopupOpen }">
      <div class="model-search">
        <i class="ph ph-magnifying-glass"></i>
        <input v-model="searchQuery" type="text" placeholder="搜索模型..." autocomplete="off" />
      </div>
      <div class="model-list-container" ref="modelListRef">
        <!-- 无结果提示 -->
        <div v-if="filteredModels.length === 0" class="no-results">
          未找到模型
        </div>

        <!-- 模型列表 -->
        <template v-else>
          <!-- 扁平化的模型列表，用于统一List组件 -->
          <List type="ungap" :items="flatModelList.map(item => ({
            ...item.model,
            providerId: item.providerId
          }))" :key-field="'id'" :main-field="'name'" :sub-field="'description'" :show-header="true"
            :render-header="renderProviderHeader" :selectable="true" :is-selected="isModelSelected"
            @select="handleModelSelect">
            <template #actions="{ item }">
              <i class="ph-bold ph-check" :style="{
                fontSize: '12px',
                color: item.id === selectedModelId ? 'var(--accent-color)' : undefined,
                opacity: item.id === selectedModelId ? 1 : 0
              }"></i>
            </template>
          </List>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-selector-wrapper {
  position: relative;
}

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

.model-popup {
  position: absolute;
  bottom: 38px;
  left: 0;
  width: 240px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.12),
    0 1px 4px rgba(0, 0, 0, 0.05);
  display: none;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
  transform-origin: bottom left;
}

.model-popup.show {
  display: flex;
  animation: popupFadeIn 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes popupFadeIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(4px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.model-search {
  padding: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-search input {
  border: none;
  background: transparent;
  width: 100%;
  outline: none;
  font-size: 12px;
  color: var(--text-primary);
  padding: 0;
  font-family: var(--font-stack);
}

.model-search i {
  color: var(--text-tertiary);
  font-size: 14px;
}

.model-list-container {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
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

.no-results {
  padding: 10px;
  text-align: center;
  color: #999;
  font-size: 12px;
}
</style>
