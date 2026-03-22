<script setup lang="ts">
import type { CascaderPanelItem, CascaderPanelSelectResult } from './CascaderPanel.types'

interface Props {
  visible?: boolean
  mobile?: boolean
  emptyText?: string
  items?: CascaderPanelItem[]
  autoExpandFirst?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  mobile: false,
  emptyText: '暂无可用选项',
  items: () => [],
  autoExpandFirst: false
})

const emit = defineEmits<{
  select: [payload: { item: CascaderPanelItem, path: CascaderPanelItem[] }]
}>()

const activeIndices = ref<number[]>([])
const expandedDepth = ref(0)
const activeDepth = ref(0)

const hasChildren = (item?: CascaderPanelItem | null) => typeof item?.children !== 'undefined'

const resolveChildren = (item: CascaderPanelItem, path: CascaderPanelItem[]) => {
  if (!item.children) return []
  return typeof item.children === 'function' ? item.children(item, path) : item.children
}

const clampIndex = (depth: number, length: number) => {
  if (length <= 0) return -1
  const nextIndex = activeIndices.value[depth] ?? 0
  return Math.min(Math.max(nextIndex, 0), length - 1)
}

const getItemsAtDepth = (depth: number): CascaderPanelItem[] => {
  if (depth === 0) return props.items

  let items = props.items
  const path: CascaderPanelItem[] = []

  for (let level = 0; level < depth; level += 1) {
    const index = clampIndex(level, items.length)
    const item = index >= 0 ? items[index] : null
    if (!item) return []
    path.push(item)
    items = resolveChildren(item, [...path])
  }

  return items
}

const getPathToItem = (depth: number, index?: number): CascaderPanelItem[] => {
  let items = props.items
  const path: CascaderPanelItem[] = []

  for (let level = 0; level <= depth; level += 1) {
    const currentIndex = level === depth ? (index ?? clampIndex(level, items.length)) : clampIndex(level, items.length)
    const item = currentIndex >= 0 ? items[currentIndex] : null
    if (!item) break
    path.push(item)
    if (level < depth) {
      items = resolveChildren(item, [...path])
    }
  }

  return path
}

const getItemAtDepth = (depth: number, index?: number) => {
  const items = getItemsAtDepth(depth)
  const currentIndex = index ?? clampIndex(depth, items.length)
  return currentIndex >= 0 ? items[currentIndex] : null
}

const getChildrenAtDepth = (depth: number, index?: number) => {
  const path = getPathToItem(depth, index)
  const item = path[path.length - 1]
  if (!item) return []
  return resolveChildren(item, path)
}

const panelDepths = computed(() => {
  return Array.from({ length: expandedDepth.value + 1 }, (_, index) => index)
})

const initializeNavigation = () => {
  activeIndices.value = []
  expandedDepth.value = 0
  activeDepth.value = 0

  if (!props.items.length) return

  activeIndices.value[0] = 0

  const firstItem = props.items[0]
  if (!props.autoExpandFirst || !hasChildren(firstItem)) return

  expandedDepth.value = 1
  const childItems = getChildrenAtDepth(0, 0)
  if (childItems.length > 0) {
    activeIndices.value[1] = 0
    activeDepth.value = 1
  }
}

const resetToDepth = (depth: number) => {
  activeIndices.value = activeIndices.value.slice(0, depth + 1)
  expandedDepth.value = depth
  activeDepth.value = Math.min(activeDepth.value, depth)
}

const openChildPanel = (depth: number, index?: number, focusChild = true) => {
  const item = getItemAtDepth(depth, index)
  if (!item || !hasChildren(item)) {
    resetToDepth(depth)
    return false
  }

  const nextDepth = depth + 1
  activeIndices.value[depth] = index ?? clampIndex(depth, getItemsAtDepth(depth).length)
  expandedDepth.value = nextDepth
  activeIndices.value = activeIndices.value.slice(0, nextDepth + 1)

  const childItems = getChildrenAtDepth(depth, index)
  if (childItems.length > 0) {
    const nextIndex = activeIndices.value[nextDepth] ?? 0
    activeIndices.value[nextDepth] = Math.min(Math.max(nextIndex, 0), childItems.length - 1)
    if (focusChild) {
      activeDepth.value = nextDepth
    }
    return true
  }

  if (!focusChild) {
    activeDepth.value = depth
  }
  return true
}

const moveActiveIndex = (step: number) => {
  const items = getItemsAtDepth(activeDepth.value)
  if (!items.length) return { handled: false }

  const currentIndex = clampIndex(activeDepth.value, items.length)
  const nextIndex = (currentIndex + step + items.length) % items.length
  activeIndices.value[activeDepth.value] = nextIndex

  if (expandedDepth.value > activeDepth.value) {
    openChildPanel(activeDepth.value, nextIndex, false)
  }

  return { handled: true }
}

const selectItem = (depth: number, index?: number): CascaderPanelSelectResult => {
  const item = getItemAtDepth(depth, index)
  if (!item) return { handled: false }

  if (hasChildren(item)) {
    openChildPanel(depth, index, true)
    return { handled: true }
  }

  return {
    handled: true,
    item,
    path: getPathToItem(depth, index)
  }
}

const handleItemPointerEnter = (depth: number, index: number) => {
  activeIndices.value[depth] = index

  if (expandedDepth.value > depth) {
    openChildPanel(depth, index, false)
    return
  }

  activeDepth.value = depth
}

const handleItemPointerDown = (depth: number, index: number) => {
  const result = selectItem(depth, index)
  if (result.item && result.path) {
    emit('select', { item: result.item, path: result.path })
  }
}

const handleKeydown = (event: KeyboardEvent): CascaderPanelSelectResult => {
  if (!props.visible) return { handled: false }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    return moveActiveIndex(1)
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    return moveActiveIndex(-1)
  }

  if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === 'Tab') {
    const currentItems = getItemsAtDepth(activeDepth.value)
    if (!currentItems.length) return { handled: false }

    event.preventDefault()
    return selectItem(activeDepth.value)
  }

  if (event.key === 'ArrowLeft') {
    if (expandedDepth.value === 0) return { handled: false }

    event.preventDefault()
    resetToDepth(Math.max(expandedDepth.value - 1, 0))
    return { handled: true }
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    return { handled: true, requestClose: true }
  }

  return { handled: false }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      activeIndices.value = []
      expandedDepth.value = 0
      activeDepth.value = 0
      return
    }

    initializeNavigation()
  },
  { immediate: true }
)

watch(
  () => props.items,
  () => {
    if (!props.visible) return
    initializeNavigation()
  }
)

defineExpose({
  handleKeydown,
  initializeNavigation
})
</script>

<template>
  <div
    v-if="visible"
    class="cascader-panel"
    :class="{ 'cascader-panel--mobile': mobile }"
  >
    <div class="cascader-panel__track">
      <div
        v-for="depth in panelDepths"
        :key="depth"
        class="cascader-panel__column"
        :class="{
          'cascader-panel__column--root': depth === 0,
          'cascader-panel__column--child': depth > 0
        }"
      >
        <div class="cascader-panel__list">
          <template v-if="getItemsAtDepth(depth).length > 0">
            <button
              v-for="(item, index) in getItemsAtDepth(depth)"
              :key="item.key"
              class="cascader-panel__item"
              :class="{
                'is-active': activeIndices[depth] === index,
                'is-focused': activeDepth === depth && activeIndices[depth] === index
              }"
              type="button"
              @mouseenter="handleItemPointerEnter(depth, index)"
              @mousedown.prevent="handleItemPointerDown(depth, index)"
            >
              <span
                v-if="item.icon"
                class="cascader-panel__item-icon"
                :class="`cascader-panel__item-icon--${item.icon}`"
              >
                <span class="cascader-panel__item-icon-glyph"></span>
              </span>
              <div class="cascader-panel__item-copy">
                <span class="cascader-panel__item-label">{{ item.label }}</span>
                <span v-if="item.description" class="cascader-panel__item-desc">{{ item.description }}</span>
              </div>
              <span v-if="hasChildren(item)" class="cascader-panel__item-arrow">›</span>
            </button>
          </template>

          <div v-else class="cascader-panel__empty">
            {{ emptyText }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cascader-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
}

.cascader-panel__track {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  overflow: visible;
}

.cascader-panel__column {
  position: relative;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow:
    0 8px 18px rgba(var(--text-rgb), 0.1),
    0 1px 3px rgba(var(--text-rgb), 0.05);
}

.cascader-panel__column--root {
  width: 138px;
}

.cascader-panel__column--child {
  width: min(248px, 20vw);
  max-height: min(220px, calc(100vh - 240px));
  overflow-y: auto;
}

.cascader-panel__column--child::before {
  content: '';
  position: absolute;
  left: -5px;
  bottom: 11px;
  width: 10px;
  height: 10px;
  border-left: 1px solid rgba(var(--text-rgb), 0.08);
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: inherit;
  transform: rotate(45deg);
}

.cascader-panel__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cascader-panel__item {
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  transition: background-color 0.14s ease;
}

.cascader-panel__item:hover,
.cascader-panel__item.is-active,
.cascader-panel__item.is-focused {
  background: var(--bg-hover);
}

.cascader-panel__item-icon {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.cascader-panel__item-icon-glyph {
  position: relative;
  display: inline-block;
  width: 10px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.cascader-panel__item-icon--split .cascader-panel__item-icon-glyph::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  width: 1px;
  background: currentColor;
  transform: translateX(-50%);
}

.cascader-panel__item-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cascader-panel__item-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  flex-shrink: 0;
}

.cascader-panel__item-desc {
  min-width: 0;
  flex: 1;
  font-size: 9px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cascader-panel__item-arrow {
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1;
}

.cascader-panel__empty {
  padding: 10px 6px;
  margin: auto 0;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}

.cascader-panel--mobile {
  bottom: calc(100% + 6px);
  width: min(248px, calc(100vw - 32px));
}

.cascader-panel--mobile .cascader-panel__track {
  flex-direction: column;
  align-items: stretch;
}

.cascader-panel--mobile .cascader-panel__column,
.cascader-panel--mobile .cascader-panel__column--root,
.cascader-panel--mobile .cascader-panel__column--child {
  width: 100%;
}

.cascader-panel--mobile .cascader-panel__column--child {
  max-height: 160px;
}

.cascader-panel--mobile .cascader-panel__column--child::before {
  display: none;
}

@media (max-width: 767px) {
  .cascader-panel {
    width: min(248px, calc(100vw - 32px));
  }

  .cascader-panel__track {
    flex-direction: column;
    align-items: stretch;
  }

  .cascader-panel__column,
  .cascader-panel__column--root,
  .cascader-panel__column--child {
    width: 100%;
  }

  .cascader-panel__column--child {
    max-height: 160px;
  }

  .cascader-panel__column--child::before {
    display: none;
  }
}
</style>
