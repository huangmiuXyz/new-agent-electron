<script setup lang="ts">
const props = defineProps<{
  searchQuery?: string
  placeholder?: string
  noResultsText?: string
  hasResults?: boolean
  width?: string
  position?: 'top' | 'bottom'
  data?: Array<any>
  title?: string
}>()
const visiable = defineModel<boolean>('visiable')
const searchQuery = defineModel<string>('searchQuery')

const containerRef = ref<HTMLElement>()

const closePopup = () => {
  visiable.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (containerRef.value && !containerRef.value.contains(target)) {
    closePopup()
  }
}

watch(
  () => visiable.value,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        document.addEventListener('click', handleClickOutside)
      })
    } else {
      document.removeEventListener('click', handleClickOutside)
    }
  }
)

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const handleSearch = (value: string) => {
  searchQuery.value = value
}
const triggerClick = () => {
  visiable.value = !visiable.value
}
</script>

<template>
  <div class="selector-trigger">
    <div @click="triggerClick">
      <slot name="trigger"></slot>
    </div>

    <BaseModal :title="title!" v-if="isMobile && visiable">
      <div v-if="$slots.content" class="content">
        <slot name="content"></slot>
      </div>
      <template v-else>
        <div class="selector-search">
          <SearchInput :search-data="data" :model-value="searchQuery" @update:model-value="handleSearch"
            :placeholder="placeholder || '搜索...'" size="sm" variant="minimal" :show-icon="true" :debounce="0"
            class="selector-search-input" />
        </div>
        <div class="selector-list-container">
          <div v-if="!hasResults" class="no-results">
            {{ noResultsText || '未找到结果' }}
          </div>
          <slot v-else></slot>
        </div>
      </template>
    </BaseModal>
    <div v-if="!isMobile" class="selector-wrapper" ref="containerRef">
      <div class="selector-popup" :class="{
        show: visiable,
        'position-bottom': (position || 'top') === 'top',
        'position-top': position === 'bottom'
      }" :style="{
        width: width || '240px',
        animation: visiable
          ? (position || 'top') === 'top'
            ? 'popupFadeIn 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
            : 'popupFadeInTop 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
          : 'none'
      }">
        <div v-if="$slots.content" class="content">
          <slot name="content"></slot>
        </div>
        <template v-else>
          <div class="selector-search">
            <SearchInput :search-data="data" :model-value="searchQuery" @update:model-value="handleSearch"
              :placeholder="placeholder || '搜索...'" size="sm" variant="minimal" :show-icon="true" :debounce="0"
              class="selector-search-input" />
          </div>
          <div class="selector-list-container">
            <div v-if="!hasResults" class="no-results">
              {{ noResultsText || '未找到结果' }}
            </div>
            <slot v-else></slot>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.selector-wrapper {
  position: relative;
}

.selector-trigger {
  cursor: pointer;
  display: inline-block;
}

.selector-popup {
  position: absolute;
  bottom: 38px;
  left: 0;
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

.selector-popup.position-bottom {
  bottom: 38px;
  transform-origin: bottom left;
}

.selector-popup.position-top {
  bottom: auto;
  top: 38px;
  transform-origin: top left;
}

.selector-popup.show {
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

@keyframes popupFadeInTop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.selector-search {
  padding: 4px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.selector-search-input {
  width: 100%;
}

.selector-search-input :deep(.search-input__field) {
  font-size: 12px;
  padding: 0;
  height: auto;
}

.selector-search-input :deep(.search-input__icon) {
  font-size: 14px;
  width: 14px;
  height: 14px;
}

.selector-list-container {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}

/* Scrollbar styles */
.selector-list-container::-webkit-scrollbar {
  width: 6px;
}

.selector-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.selector-list-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.selector-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.no-results {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

.content {
  padding: 12px;
}
</style>
