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
  desktopPresentation?: 'popover' | 'dialog' | 'tray'
  data?: Array<any>
  title?: string
  /** Anchor element selector or ref for tray positioning; defaults to the trigger */
  trayAnchor?: string
}>()
const visible = defineModel<boolean>('visible')
const searchQuery = defineModel<string>('searchQuery')

const containerRef = ref<HTMLElement>()
const searchInputRef = ref<{ focus: () => void }>()
const triggerSlotRef = ref<HTMLElement>()
const trayRef = ref<HTMLElement>()

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

const handleTrayClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (trayRef.value && !trayRef.value.contains(target)) {
    // Allow clicks inside the container (trigger) to toggle, not close
    if (containerRef.value?.contains(target)) return
    closePopup()
  }
}

watch(searchInputRef, (input) => {
  if (input && visible.value) {
    requestAnimationFrame(() => input.focus())
  }
})

watch(
  () => visible.value,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        if (shouldUseTray.value) {
          document.addEventListener('mousedown', handleTrayClickOutside)
        } else {
          document.addEventListener('click', handleClickOutside)
        }
        requestAnimationFrame(() => {
          scrollToActiveItem()
        })
      })
    } else {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('mousedown', handleTrayClickOutside)
    }
  }
)

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousedown', handleTrayClickOutside)
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
const shouldUseTray = computed(() => !isMobile.value && props.desktopPresentation === 'tray')

const dialogBodyStyle = computed<CSSProperties>(() => ({
  overflowY: 'hidden',
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'min(78vh, 820px)'
}))

const trayStyle = computed<CSSProperties>(() => {
  // Priority: trayAnchor selector > trigger slot element
  const anchor = props.trayAnchor
    ? document.querySelector<HTMLElement>(props.trayAnchor)
    : null
  const triggerEl = anchor || triggerSlotRef.value
  if (!triggerEl) return {}
  const rect = triggerEl.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  // Position tray bottom edge above the anchor, constrained to viewport
  const bottom = viewportHeight - rect.top + 8
  const maxHeight = Math.max(200, Math.min(rect.top - 24, 560))
  return {
    position: 'fixed' as const,
    left: `${rect.left + 6}px`,
    bottom: `${bottom}px`,
    width: `${rect.width - 12}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: '3100'
  }
})
</script>

<template>
  <div class="selector" ref="containerRef">
    <div ref="triggerSlotRef" @click="triggerClick">
      <slot name="trigger"></slot>
    </div>

    <!-- Tray presentation: floating panel above the input bar -->
    <Teleport to="body">
      <Transition name="tray-fade">
        <div
          v-if="shouldUseTray && visible"
          ref="trayRef"
          class="selector-tray"
          :style="trayStyle"
        >
          <template v-if="$slots.content">
            <div v-if="title" class="selector-tray-header">
              <span class="selector-tray-title">{{ title }}</span>
            </div>
            <div class="selector-tray-body selector-tray-body--full">
              <slot name="content"></slot>
            </div>
          </template>
          <template v-else>
            <div class="selector-tray-header">
              <span class="selector-tray-title">{{ title }}</span>
            </div>
            <div class="selector-tray-body">
              <div v-if="!hasResults" class="no-results">
                {{ noResultsText || '未找到结果' }}
              </div>
              <slot v-else></slot>
            </div>
            <div class="selector-tray-search">
              <SearchInput
                ref="searchInputRef"
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
          </template>
        </div>
      </Transition>
    </Teleport>

    <BaseModal
      @ok="onOk"
      :title="title!"
      :show-footer="false"
      :modal-body-style="shouldUseDialog ? dialogBodyStyle : modalBodyStyle"
      :width="width || '240px'"
      v-if="(isMobile || shouldUseDialog) && visible && !shouldUseTray"
      :on-close="closePopup"
      :on-cancel="closePopup"
    >
      <div v-if="$slots.content" class="content">
        <slot name="content"></slot>
      </div>
      <template v-else>
        <div class="selector-search" :class="{ 'selector-search-dialog': shouldUseDialog }">
          <SearchInput
            ref="searchInputRef"
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
          <div class="selector-list-container">
            <div v-if="!hasResults" class="no-results">
              {{ noResultsText || '未找到结果' }}
            </div>
            <slot v-else></slot>
          </div>
      </template>
    </BaseModal>
    <div v-if="!isMobile && !shouldUseDialog && !shouldUseTray" class="selector-wrapper">
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
              ref="searchInputRef"
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
  contain: none;
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

/* ---- Tray presentation (unscoped for Teleport) ---- */
</style>

<style>
/* ---- Tray presentation (unscoped for Teleport) ---- */
.selector-tray {
  position: fixed;
  background: var(--bg-card);
  border: 1px solid rgba(var(--text-rgb), 0.08);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.selector-tray-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
}

.selector-tray-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.selector-tray-search {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid rgba(var(--text-rgb), 0.06);
  flex-shrink: 0;
}

.selector-tray-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px;
  overscroll-behavior: contain;
  padding-top: 0 !important;
}

.selector-tray-body--full {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 8px;
}

/* Tray scrollbar */
.selector-tray-body::-webkit-scrollbar {
  width: 5px;
}

.selector-tray-body::-webkit-scrollbar-track {
  background: transparent;
}

.selector-tray-body::-webkit-scrollbar-thumb {
  background: rgba(var(--text-rgb), 0.1);
  border-radius: 999px;
}

.selector-tray-body::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--text-rgb), 0.2);
}

/* ---- Tray: let tray-body handle scrolling, disable inner List scroll ---- */
.selector-tray-body .list-scroll-area {
  overflow: visible !important;
  max-height: none !important;
  contain: none !important;
}

/* ---- Tray: model list overrides ---- */
.selector-tray-body :deep(.list-item) {
  padding: 8px 10px;
  border-radius: 8px !important;
  margin-bottom: 2px !important;
}

.selector-tray-body :deep(.list-item:hover) {
  background-color: var(--bg-hover) !important;
}

.selector-tray-body :deep(.list-item.keyboard-focused) {
  box-shadow: 0 0 0 1px var(--accent-color);
  border-radius: 8px !important;
}

.selector-tray-body :deep(.list-item.is-active) {
  background: var(--accent-color) !important;
  color: var(--bg-card) !important;
}

.selector-tray-body :deep(.main-text) {
  font-size: 12px;
  font-weight: 600;
}

.selector-tray-body :deep(.sub-text) {
  font-size: 11px;
}

.selector-tray-body :deep(.group-header) {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 8px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ---- Tray: agent item overrides ---- */
.selector-tray-body :deep(.agent-item) {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  min-height: 44px;
}

.selector-tray-body :deep(.agent-item:hover) {
  background: var(--bg-hover);
}

.selector-tray-body :deep(.agent-item.selected) {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.08);
  border-color: rgba(var(--accent-rgb, 47, 116, 255), 0.16);
}

.selector-tray-body :deep(.agent-item.focused) {
  box-shadow: 0 0 0 2px var(--accent-color);
}

/* ---- Tray transition ---- */
.tray-fade-enter-active {
  transition: opacity 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tray-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.tray-fade-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

.tray-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .tray-fade-enter-active,
  .tray-fade-leave-active {
    transition: none !important;
  }
}
</style>
