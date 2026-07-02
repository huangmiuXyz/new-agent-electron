<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, VNode, watch } from 'vue'
import draggable from 'vuedraggable'
import { assetsHandler } from '@renderer/utils'

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
  // 标记项为禁用态（视觉弱化），如已隐藏的配置项
  isDisabled?: (item: T) => boolean
  sortable?: boolean
  // 拖拽触发方式：'longpress'（长按整行）/ 'handle'（拖拽手柄）。仅 sortable 时生效
  sortMode?: 'longpress' | 'handle'
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
  sortMode: 'longpress',
  longPressMs: 300
})

const emit = defineEmits<{
  select: [id: string]
  contextmenu: [event: MouseEvent, id: string]
  sort: [payload: { fromId: string; toId: string; after: boolean }]
}>()

// 列表项视图类型：固定结构，raw 用 any 规避 Vue3 泛型组件中
// T 经 computed/ref 解包为 UnwrapRef<T> 后与 T 不兼容的类型陷阱
interface ListItemView {
  raw: any
  key: string
  main: any
  sub: any
  logo: any
  isIcon: boolean
  isActive: boolean
  isDisabled: boolean
  groupKey: string
  groupTitle: string
  isLastItem: boolean
}

const viewItems = computed<ListItemView[]>(() => {
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
      isDisabled: !!props.isDisabled?.(item),
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

// 内部预览顺序：拖拽时由 vuedraggable 直接修改，实现乐观预览
// 非拖拽时跟随 viewItems（由 watch 同步）
const previewItems = ref<ListItemView[]>(viewItems.value.map((i) => i))
const isWaitingSortSync = ref(false)
const draggingKey = ref<string | null>(null)
const longPressingKey = ref<string | null>(null)

watch(
  () => viewItems.value,
  (next) => {
    if (draggingKey.value) return
    previewItems.value = next.map((i) => i)
  },
  { deep: true, immediate: true }
)

watch(
  () => viewItems.value.map((item) => item.key),
  (keys) => {
    if (!isWaitingSortSync.value) return
    const previewKeys = previewItems.value.map((i) => i.key)
    const sameLength = keys.length === previewKeys.length
    const sameOrder = sameLength && keys.every((k, idx) => k === previewKeys[idx])
    if (sameOrder) {
      isWaitingSortSync.value = false
    }
  }
)

const handleAction = (
  type: 'select' | 'contextmenu',
  item: ListItemView,
  e?: MouseEvent
) => {
  if (type === 'select' && props.selectable) {
    emit('select', item.key)
  }
  if (type === 'contextmenu' && e) {
    emit('contextmenu', e, item.key)
  }
}

const canSort = (item: ListItemView) => {
  if (!props.sortable) return false
  if (!props.canSortItem) return true
  return props.canSortItem(item.raw)
}

const suppressNextClick = ref(false)

// sortablejs 长按激活：仅 sortMode='longpress' 时启用 delay；'handle' 模式按手柄即拖
const dragDelay = computed(() =>
  props.sortable && props.sortMode === 'longpress' ? props.longPressMs : 0
)
// 手柄模式：sortablejs 通过 handle 选择器限定只能从手柄元素发起拖拽
const dragHandle = computed(() => (props.sortMode === 'handle' ? '.list-item-drag-handle' : undefined))

// sortablejs 的 choose 事件：按下被选中（delay 期间也会触发），用于视觉反馈
const onChoose = (evt: { oldIndex: number }) => {
  const item = previewItems.value[evt.oldIndex]
  if (item && canSort(item)) {
    longPressingKey.value = item.key
  }
}

const onUnchoose = () => {
  longPressingKey.value = null
}

// vuedraggable 拖拽真正开始（delay 结束后）
const onDragStart = (evt: { oldIndex: number }) => {
  const item = previewItems.value[evt.oldIndex]
  if (!item) return
  draggingKey.value = item.key
  longPressingKey.value = null
  suppressNextClick.value = true
}

// vuedraggable 拖拽结束：根据 oldIndex/newIndex 计算 fromId/toId/after 并 emit
const onDragEnd = (evt: { oldIndex: number; newIndex: number }) => {
  const { oldIndex, newIndex } = evt
  const fromItem = previewItems.value[newIndex] // 拖拽后预览数组已更新，被拖项现在在 newIndex
  draggingKey.value = null
  longPressingKey.value = null

  if (oldIndex === newIndex || !fromItem) {
    previewItems.value = viewItems.value.map((i) => i)
    window.setTimeout(() => {
      suppressNextClick.value = false
    }, 150)
    return
  }

  let toId: string
  let after: boolean
  if (newIndex > 0) {
    toId = previewItems.value[newIndex - 1]!.key
    after = true
  } else if (previewItems.value.length > 1) {
    toId = previewItems.value[1]!.key
    after = false
  } else {
    previewItems.value = viewItems.value.map((i) => i)
    return
  }

  emit('sort', { fromId: fromItem.key, toId, after })
  isWaitingSortSync.value = true

  window.setTimeout(() => {
    suppressNextClick.value = false
    if (isWaitingSortSync.value) {
      isWaitingSortSync.value = false
      previewItems.value = viewItems.value.map((i) => i)
    }
  }, 300)
}

const handleItemClick = (item: ListItemView) => {
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

    <div class="list-scroll-area" :class="{ 'has-long-press': !!longPressingKey }">
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

      <draggable
        v-else
        v-model="previewItems"
        :item-key="(item: any) => item.key"
        :disabled="!sortable"
        :delay="dragDelay"
        :delay-on-touch-only="false"
        :touch-start-threshold="8"
        :handle="dragHandle"
        :animation="180"
        ghost-class="list-drag-ghost"
        chosen-class="list-drag-chosen"
        @choose="onChoose"
        @unchoose="onUnchoose"
        @start="onDragStart"
        @end="onDragEnd"
      >
        <template #item="{ element: item }">
          <div>
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
                'is-disabled': item.isDisabled,
                'is-long-pressing': longPressingKey === item.key,
                'is-dragging': draggingKey === item.key
              }"
              @click="handleItemClick(item)"
              @contextmenu="handleAction('contextmenu', item, $event)"
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

              <!-- 拖拽手柄：仅 sortMode='handle' 且可排序时显示 -->
              <div
                v-if="sortable && sortMode === 'handle' && canSort(item)"
                class="list-item-drag-handle"
                title="拖动排序"
              >
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="9" cy="6" r="1.4" />
                  <circle cx="15" cy="6" r="1.4" />
                  <circle cx="9" cy="12" r="1.4" />
                  <circle cx="15" cy="12" r="1.4" />
                  <circle cx="9" cy="18" r="1.4" />
                  <circle cx="15" cy="18" r="1.4" />
                </svg>
              </div>
            </div>
          </div>
        </template>
      </draggable>
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
  margin-bottom: 6px;
  letter-spacing: -0.08px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition:
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    color var(--motion-duration-fast) var(--motion-ease-standard),
    box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: var(--sidebar-gap, 2px);
  border-radius: var(--sidebar-item-radius, var(--radius-sm));
  user-select: none;
}

.list-item.is-sortable {
  touch-action: manipulation;
}

/* 进入长按态时，其他项轻微变暗，制造对比 */
.list-scroll-area.has-long-press .list-item:not(.is-long-pressing):not(.is-dragging) {
  opacity: 0.45;
}

/* 被长按激活的项：主题色描边 + 内高光 + 抬起阴影，不改变尺寸避免溢出截断 */
.list-item.is-long-pressing {
  background-color: var(--bg-active);
  outline: 2px solid var(--accent-color, var(--color-primary, #3b82f6));
  outline-offset: -2px;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.18),
    inset 0 0 0 1px color-mix(in srgb, var(--accent-color, var(--color-primary, #3b82f6)) 30%, transparent);
  cursor: grab;
  z-index: 5;
  position: relative;
}

.list-item.is-dragging,
:deep(.list-drag-ghost) {
  opacity: 0.55;
}

:deep(.list-drag-chosen) {
  cursor: grabbing;
}

.list-item:hover {
  background-color: var(--sidebar-hover-bg, var(--bg-hover));
}

.list-item.is-active {
  background-color: var(--sidebar-active-bg, var(--bg-active));
  color: var(--text-primary);
  position: relative;
}

.list-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--sidebar-active-indicator-width, 3px);
  height: 55%;
  background: var(--sidebar-active-accent, var(--color-primary));
  border-radius: var(--sidebar-active-indicator-radius, 2px);
}

/* 禁用态（如已隐藏的配置项）：视觉弱化 */
.list-item.is-disabled {
  opacity: 0.5;
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

/* 拖拽手柄 */
.list-item-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 24px;
  margin-left: 4px;
  color: var(--text-tertiary);
  cursor: grab;
  touch-action: none;
  opacity: 0.6;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.list-item-drag-handle:hover {
  opacity: 1;
  color: var(--text-primary);
}

.list-item-drag-handle:active {
  cursor: grabbing;
}

.list-item-drag-handle :deep(svg) {
  width: 100%;
  height: 100%;
}

.item-media {
  display: flex;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.sub-text {
  display: none;
}

.main-text {
  font-size: 13px;
  font-weight: 400;
}

.media-img {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}

.media-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 24px;
  color: var(--text-secondary);
}

.media-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.group-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 8px 8px 4px;
  letter-spacing: -0.08px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
