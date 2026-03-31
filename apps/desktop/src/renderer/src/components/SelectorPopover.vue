<script setup lang="ts">
import type { CSSProperties } from 'vue'

const props = defineProps<{
  searchQuery?: string
  searchDebounce?: number
  placeholder?: string
  noResultsText?: string
  hasResults?: boolean
  width?: string
  position?: 'top' | 'bottom'
  desktopPresentation?: 'popover' | 'dialog'
  data?: Array<any>
  title?: string
}>()
const visible = defineModel<boolean>('visible')
const searchQuery = defineModel<string>('searchQuery')

const containerRef = ref<HTMLElement>()
const listContainerRef = ref<HTMLElement>()

const closePopup = () => {
  visible.value = false
}

const scrollToActiveItem = () => {
  if (!containerRef.value) return
  const activeItem = containerRef.value.querySelector<HTMLElement>(
    '.list-item.is-active, .agent-item.selected'
  )
  activeItem?.scrollIntoView({
    block: 'center',
    inline: 'nearest'
  })
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  // Keep the current selector dialog open when another modal is opened on top of it.
  if (target.closest('.modal-overlay')) {
    return
  }
  if (containerRef.value && !containerRef.value.contains(target)) {
    closePopup()
  }
}

watch(
  () => visible.value,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        document.addEventListener('click', handleClickOutside)
        requestAnimationFrame(() => {
          scrollToActiveItem()
        })
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
  visible.value = !visible.value
}
const emits = defineEmits(['ok'])
const onOk = () => {
  emits('ok')
}

const modalBodyStyle: CSSProperties = {
  overflowY: 'hidden',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column'
}

const shouldUseDialog = computed(() => !isMobile.value && props.desktopPresentation === 'dialog')

const dialogBodyStyle = computed<CSSProperties>(() => ({
  overflowY: 'hidden',
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'min(78vh, 820px)'
}))
</script>

<template>
  <div class="selector" ref="containerRef">
    <div @click="triggerClick">
      <slot name="trigger"></slot>
    </div>

    <BaseModal
      @ok="onOk"
      :title="title!"
      :show-footer="false"
      :modal-body-style="shouldUseDialog ? dialogBodyStyle : modalBodyStyle"
      :width="width || '240px'"
      v-if="(isMobile || shouldUseDialog) && visible"
      :on-close="closePopup"
      :on-cancel="closePopup"
    >
      <div v-if="$slots.content" class="content">
        <slot name="content"></slot>
      </div>
      <template v-else>
        <div class="selector-search" :class="{ 'selector-search-dialog': shouldUseDialog }">
          <SearchInput
            :search-data="data"
            :model-value="searchQuery"
            @update:model-value="handleSearch"
            :placeholder="placeholder || '搜索...'"
            size="sm"
            variant="minimal"
            :show-icon="true"
            :debounce="searchDebounce ?? 0"
            class="selector-search-input"
          />
          <slot name="search-action"></slot>
        </div>
          <div class="selector-list-container" ref="listContainerRef" v-scroll>
            <div v-if="!hasResults" class="no-results">
              {{ noResultsText || '未找到结果' }}
            </div>
            <slot v-else></slot>
          </div>
      </template>
    </BaseModal>
    <div v-if="!isMobile && !shouldUseDialog" class="selector-wrapper">
      <div
        class="selector-popup"
        :class="{
          show: visible,
          'position-bottom': (position || 'top') === 'top',
          'position-top': position === 'bottom'
        }"
        :style="{
          width: width || '240px',
          animation: visible
            ? (position || 'top') === 'top'
              ? 'popupFadeIn 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
              : 'popupFadeInTop 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
            : 'none'
        }"
      >
        <div v-if="$slots.content" class="content">
          <slot name="content"></slot>
        </div>
        <template v-else>
          <div class="selector-search">
            <SearchInput
              :search-data="data"
              :model-value="searchQuery"
              @update:model-value="handleSearch"
              :placeholder="placeholder || '搜索...'"
              size="sm"
              variant="minimal"
              :show-icon="true"
              :debounce="searchDebounce ?? 0"
              class="selector-search-input"
            />
            <slot name="search-action"></slot>
          </div>
          <div class="selector-list-container" v-scroll>
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
  background: rgba(var(--bg-rgb), 0.98);
  border: 1px solid rgba(var(--text-rgb), 0.08);
  border-radius: 10px;
  box-shadow: 0 6px 16px rgba(var(--text-rgb), 0.08);
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
  /* top: 38px; */
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
  border-bottom: 1px solid rgba(var(--text-rgb), 0.06);
  display: flex;
  align-items: center;
  gap: 4px;
}

.selector-search-dialog {
  padding: 8px 10px;
}

.selector-search-input {
  width: 100%;
  flex: 1;
  min-width: 0;
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
  flex: 1;
  min-height: 0;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  overscroll-behavior: contain;
}

:deep(.modal-body) .selector-list-container {
  max-height: min(62vh, 640px);
  padding: 4px 10px 10px;
}

/* 统一由 selector-list-container 负责滚动，避免与内部 List 双滚动冲突 */
.selector-list-container :deep(.list-scroll-area) {
  overflow: visible;
  max-height: none;
  touch-action: auto;
}

/* 确保 list-item 不阻止滚轮事件 */
.selector-list-container :deep(.list-item) {
  touch-action: auto;
}

@media (prefers-reduced-motion: reduce) {
  .selector-popup.show {
    animation: none !important;
  }
}

/* Scrollbar styles */
.selector-list-container::-webkit-scrollbar {
  width: 6px;
}

.selector-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.selector-list-container::-webkit-scrollbar-thumb {
  background: rgba(var(--text-rgb), 0.1);
  border-radius: 3px;
}

.selector-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--text-rgb), 0.2);
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
