<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, VNode, watch } from 'vue'
import { assetsHandler } from '@renderer/utils'
import { useTimeoutFn } from '@vueuse/core'

const TRANSPARENT_DRAG_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

interface Props {
  defaultIcon?: VNode
  items: T[]
  title?: string
  activeId?: string

  loading?: boolean
  emptyText?: string

  keyField?: string
  mainField?: string
  subField?: string
  logoField?: string

  selectable?: boolean
  variant?: 'default' | 'card'
  showHeader?: boolean
  renderHeader?: (item: T) => string
  isSelected?: (item: T) => boolean
  sortable?: boolean
  longPressMs?: number
  canSortItem?: (item: T) => boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  emptyText: '暂无数据',
  keyField: 'id',
  mainField: 'name',
  subField: '',
  logoField: 'logo',
  selectable: true,
  variant: 'default',
  showHeader: false,
  sortable: false,
  longPressMs: 300
})

const emit = defineEmits<{
  select: [id: string]
  contextmenu: [event: MouseEvent, id: string]
  sort: [payload: { fromId: string; toId: string; after: boolean }]
}>()

const viewItems = computed(() => {
  const items = props.items.map((item) => {
    const key = item[props.keyField] ?? JSON.stringify(item)
    let logo = item[props.logoField]
    const isIcon = typeof logo === 'object' || typeof logo === 'function'

    if (!isIcon && typeof logo === 'string') {
      logo = assetsHandler(logo)
    }

    return {
      raw: item,
      key,
      main: item[props.mainField] ?? key,
      sub: props.subField ? item[props.subField] : '',
      logo,
      isIcon,
      isActive: props.isSelected?.(item) || props.activeId === key,
      groupKey: '',
      groupTitle: ''
    }
  })

  if (props.showHeader && props.renderHeader) {
    let prevGroupKey: string | null = null
    items.forEach((item, index) => {
      const groupKey = props.renderHeader!(item.raw)
      item.groupKey = groupKey
      if (index === 0 || groupKey !== prevGroupKey) {
        item.groupTitle = groupKey
      }
      prevGroupKey = groupKey
    })
  }

  return items.map((item, index) => ({
    ...item,
    isLastItem: index === items.length - 1 || item.groupKey !== items[index + 1]!.groupKey
  }))
})

const dragPreviewKeys = ref<string[] | null>(null)
const displayedItems = computed(() => {
  const preview = dragPreviewKeys.value
  if (!preview) return viewItems.value
  const itemMap = new Map(viewItems.value.map((item) => [item.key, item] as const))
  return preview.map((key) => itemMap.get(key)).filter(Boolean) as (typeof viewItems.value)
})

const handleAction = (
  type: 'select' | 'contextmenu',
  item: (typeof viewItems.value)[number],
  e?: MouseEvent
) => {
  if (type === 'select' && props.selectable) {
    emit('select', item.key)
  }
  if (type === 'contextmenu' && e) {
    emit('contextmenu', e, item.key)
  }
}

const pressCandidateKey = ref<string | null>(null)
const longPressArmedKey = ref<string | null>(null)
const draggingKey = ref<string | null>(null)
const lastDropTarget = ref<{ toId: string; after: boolean } | null>(null)
const hasCommittedSort = ref(false)
const isWaitingSortSync = ref(false)
const suppressNextClick = ref(false)
const dragImage = new Image()
dragImage.src = TRANSPARENT_DRAG_IMAGE

const isSameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((key, index) => key === b[index])

const { start: startLongPress, stop: stopLongPress, isPending: isLongPressPending } = useTimeoutFn(
  () => {
    if (pressCandidateKey.value) {
      longPressArmedKey.value = pressCandidateKey.value
    }
  },
  computed(() => props.longPressMs),
  { immediate: false }
)

const canSort = (item: (typeof viewItems.value)[number]) => {
  if (!props.sortable) return false
  if (!props.canSortItem) return true
  return props.canSortItem(item.raw)
}

const handlePointerDown = (item: (typeof viewItems.value)[number], event: PointerEvent) => {
  if (!canSort(item)) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (event.pointerType === 'mouse') {
    longPressArmedKey.value = item.key
    pressCandidateKey.value = null
    stopLongPress()
    return
  }
  pressCandidateKey.value = item.key
  startLongPress()
}

const clearPressState = () => {
  stopLongPress()
  pressCandidateKey.value = null
  if (!draggingKey.value) {
    longPressArmedKey.value = null
  }
}

const handleDragStart = (item: (typeof viewItems.value)[number], event: DragEvent) => {
  if (!props.sortable || longPressArmedKey.value !== item.key || !canSort(item)) {
    event.preventDefault()
    return
  }
  draggingKey.value = item.key
  dragPreviewKeys.value = viewItems.value.map((v) => v.key)
  hasCommittedSort.value = false
  suppressNextClick.value = true
  event.dataTransfer?.setData('text/plain', item.key)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setDragImage(dragImage, 0, 0)
  }
}

const handleDrop = (item: (typeof viewItems.value)[number]) => {
  if (!draggingKey.value) return
  const dropTarget = lastDropTarget.value || { toId: item.key, after: false }
  if (draggingKey.value !== dropTarget.toId) {
    emit('sort', { fromId: draggingKey.value, toId: dropTarget.toId, after: dropTarget.after })
    hasCommittedSort.value = true
  }
}

const moveKeyByTarget = (keys: string[], fromId: string, toId: string, after: boolean) => {
  if (fromId === toId) return keys
  const fromIndex = keys.indexOf(fromId)
  if (fromIndex === -1) return keys
  const next = [...keys]
  const [dragged] = next.splice(fromIndex, 1)
  if (!dragged) return keys
  const targetIndex = next.indexOf(toId)
  if (targetIndex === -1) return keys
  const insertIndex = after ? targetIndex + 1 : targetIndex
  next.splice(insertIndex, 0, dragged)
  return next
}

const handleDragOver = (item: (typeof viewItems.value)[number], event: DragEvent) => {
  if (!draggingKey.value || !canSort(item) || draggingKey.value === item.key) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  const targetEl = event.currentTarget as HTMLElement | null
  const rect = targetEl?.getBoundingClientRect()
  const after = !!rect && event.clientY > rect.top + rect.height / 2
  lastDropTarget.value = { toId: item.key, after }
  const baseKeys = dragPreviewKeys.value ?? viewItems.value.map((v) => v.key)
  dragPreviewKeys.value = moveKeyByTarget(baseKeys, draggingKey.value, item.key, after)
}

const handleDragEnd = () => {
  const draggingId = draggingKey.value
  const previewKeys = dragPreviewKeys.value
  let shouldWaitForSync = false
  if (!hasCommittedSort.value && draggingId && previewKeys) {
    const originKeys = viewItems.value.map((v) => v.key)
    const changed = !isSameOrder(originKeys, previewKeys)
    if (changed) {
      const nextIndex = previewKeys.indexOf(draggingId)
      if (nextIndex > 0) {
        emit('sort', { fromId: draggingId, toId: previewKeys[nextIndex - 1]!, after: true })
        shouldWaitForSync = true
      } else if (nextIndex === 0 && previewKeys.length > 1) {
        emit('sort', { fromId: draggingId, toId: previewKeys[1]!, after: false })
        shouldWaitForSync = true
      }
    }
  } else if (hasCommittedSort.value && previewKeys) {
    shouldWaitForSync = true
  }
  draggingKey.value = null
  longPressArmedKey.value = null
  pressCandidateKey.value = null
  lastDropTarget.value = null
  hasCommittedSort.value = false
  isWaitingSortSync.value = shouldWaitForSync
  if (!shouldWaitForSync) {
    dragPreviewKeys.value = null
  }
  stopLongPress()
  window.setTimeout(() => {
    suppressNextClick.value = false
  }, 150)
}

watch(
  () => viewItems.value.map((item) => item.key),
  (keys) => {
    if (!isWaitingSortSync.value || !dragPreviewKeys.value) return
    if (isSameOrder(keys, dragPreviewKeys.value)) {
      dragPreviewKeys.value = null
      isWaitingSortSync.value = false
    }
  }
)

const handleItemClick = (item: (typeof viewItems.value)[number]) => {
  if (props.sortable && suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  handleAction('select', item)
}
</script>

<template>
  <div class="list-container" :class="[`variant-${variant}`]">
    <div v-if="title" class="list-title">
      <div>{{ title }}</div>
      <div class="list-title-actions">
        <slot name="title-tool" />
      </div>
    </div>

    <div class="list-scroll-area">
      <div v-if="loading" class="state-container">
        <slot name="loading">
          <Loading />
        </slot>
      </div>

      <div v-else-if="viewItems.length === 0" class="state-container">
        <slot name="empty">
          <div class="empty-text">{{ emptyText }}</div>
        </slot>
      </div>

      <template v-else>
        <template v-for="item in displayedItems" :key="item.key">
          <div v-if="item.groupTitle" class="group-header">
            <slot name="group-header" :title="item.groupTitle" :item="item.raw">
              {{ item.groupTitle }}
            </slot>
          </div>

          <div
            class="list-item"
            :class="{
              'is-active': item.isActive,
              'is-last': item.isLastItem,
              'is-sortable': canSort(item),
              'is-long-pressing': isLongPressPending && pressCandidateKey === item.key,
              'is-drag-ready': longPressArmedKey === item.key,
              'is-dragging': draggingKey === item.key
            }"
            :draggable="sortable && longPressArmedKey === item.key && canSort(item)"
            @click="handleItemClick(item)"
            @contextmenu="handleAction('contextmenu', item, $event)"
            @pointerdown="handlePointerDown(item, $event)"
            @pointerup="clearPressState"
            @pointercancel="clearPressState"
            @dragstart="handleDragStart(item, $event)"
            @dragover="handleDragOver(item, $event)"
            @drop.prevent="handleDrop(item)"
            @dragend="handleDragEnd"
          >
            <div v-if="item.logo || defaultIcon" class="item-media">
              <component v-if="item.isIcon" :is="item.logo" class="media-icon" />
              <Image
                v-else-if="item.logo"
                :src="item.logo"
                :alt="String(item.main)"
                class="media-img"
              />
              <component v-else-if="defaultIcon" :is="defaultIcon" class="media-icon" />
            </div>

            <div class="item-content">
              <slot name="main" :item="item.raw">
                <div class="main-text text-truncate">
                  {{ item.main }}
                </div>
              </slot>
              <div v-if="item.sub" class="sub-text text-truncate">
                {{ item.sub }}
              </div>
            </div>

            <div v-if="$slots.actions" class="item-actions">
              <slot name="actions" :item="item.raw" :is-active="item.isActive" />
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.list-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  position: relative;
  contain: content;
  overscroll-behavior: contain;
}

.state-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 100px;
  padding: 20px;
  color: var(--text-tertiary);
}

.empty-text {
  font-size: 13px;
  user-select: none;
}

.list-container {
  height: 100%;
  min-height: 0;
  background-color: var(--bg-card);
  z-index: 2;
  display: flex;
  flex-direction: column;
}

/* Variant: Card */
.variant-card {
  background-color: transparent;
}

.variant-card .list-scroll-area {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
  height: auto;
  flex: none;
}

.variant-card .list-item {
  padding: 12px 16px;
  margin-bottom: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.variant-card .list-item:last-child {
  border-bottom: none;
}

.variant-card .main-text {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-primary);
}

.variant-card .item-actions {
  padding-left: 0;
}

.list-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  padding-left: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  user-select: none;
}

.list-item.is-sortable {
  touch-action: manipulation;
}

.list-item.is-long-pressing {
  transform: scale(0.99);
}

.list-item.is-drag-ready {
  cursor: grab;
}

.list-item.is-dragging {
  opacity: 0.55;
}

.list-item:hover {
  background-color: var(--bg-hover);
}

.list-item.is-active {
  background-color: var(--bg-active);
  color: var(--accent-color);
}

.item-content {
  flex: 1;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  margin-left: auto;
  padding-left: 8px;
}

.item-media {
  display: flex;
}

.sub-text {
  display: none;
}

.main-text {
  font-size: 13px;
  font-weight: 500;
}

.media-img {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}

.media-icon {
  width: 24px;
  height: 24px;
  font-size: 16px;
  color: var(--text-secondary);
}

.group-header {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding: 6px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
