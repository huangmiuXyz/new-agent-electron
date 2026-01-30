<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, VNode } from 'vue'
import { assetsHandler } from '@renderer/utils'
import { useVirtualList } from '@vueuse/core'

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

  // Virtual scroll props
  virtual?: boolean
  itemHeight?: number
}

type ListItem<T> =
  | {
      type: 'header'
      key: string
      groupTitle: string
      height: number
    }
  | {
      type: 'item'
      raw: T
      key: string
      main: any
      sub: string
      logo: any
      isIcon: boolean
      isActive: boolean
      groupKey: string
      isLastItem: boolean
      height: number
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
  virtual: true,
  itemHeight: 0
})

const emit = defineEmits<{
  select: [id: string]
  contextmenu: [event: MouseEvent, id: string]
}>()

// Flatten items for virtual scrolling if headers are shown
const flattenedItems = computed(() => {
  const result: ListItem<T>[] = []
  props.items.forEach((item, index) => {
    const key = item[props.keyField] ?? JSON.stringify(item)
    let logo = item[props.logoField]
    const isIcon = typeof logo === 'object' || typeof logo === 'function'

    if (!isIcon && typeof logo === 'string') {
      logo = assetsHandler(logo)
    }

    const groupKey =
      props.showHeader && props.renderHeader
        ? props.renderHeader(item)
        : ''

    if (props.showHeader && props.renderHeader) {
      const prevGroupKey =
        index > 0 ? props.renderHeader(props.items[index - 1]!) : null
      if (index === 0 || groupKey !== prevGroupKey) {
        result.push({
          type: 'header',
          key: `header-${groupKey}`,
          groupTitle: groupKey,
          height: 20
        })
      }
    }

    // Check if it's the last item in its group
    const nextItem = index < props.items.length - 1 ? props.items[index + 1] : null
    const nextGroupKey = nextItem && props.showHeader && props.renderHeader
      ? props.renderHeader(nextItem)
      : null
    const isLastItem = !nextItem || groupKey !== nextGroupKey

    result.push({
      type: 'item',
      raw: item,
      key,
      main: item[props.mainField] ?? key,
      sub: props.subField ? item[props.subField] : '',
      logo,
      isIcon,
      isActive: props.isSelected?.(item) || props.activeId === key,
      groupKey,
      isLastItem,
      height: props.itemHeight || (props.variant === 'card' ? 48 : 44)
    })
  })
  return result
})

const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(flattenedItems, {
  itemHeight: (index) => flattenedItems.value[index].height,
  overscan: 10
})

defineExpose({
  scrollTo,
  containerRef: containerProps.ref
})

const handleAction = (
  type: 'select' | 'contextmenu',
  item: Extract<ListItem<T>, { type: 'item' }>,
  e?: MouseEvent
) => {
  if (type === 'select' && props.selectable) {
    emit('select', item.key)
  }
  if (type === 'contextmenu' && e) {
    emit('contextmenu', e, item.key)
  }
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

    <div v-bind="containerProps" class="list-scroll-area">
      <div v-if="loading" class="state-container">
        <slot name="loading">
          <Loading />
        </slot>
      </div>

      <div v-else-if="flattenedItems.length === 0" class="state-container">
        <slot name="empty">
          <div class="empty-text">{{ emptyText }}</div>
        </slot>
      </div>

      <div v-else v-bind="wrapperProps">
        <template v-for="item in list" :key="item.data.key">
          <div v-if="item.data.type === 'header'" class="group-header">
            {{ item.data.groupTitle }}
          </div>

          <div v-else class="list-item" :class="{
            'is-active': item.data.isActive,
            'is-last': item.data.isLastItem
          }" @click="handleAction('select', item.data)" @contextmenu="handleAction('contextmenu', item.data, $event)">
            <div v-if="item.data.logo || defaultIcon" class="item-media">
              <component v-if="item.data.isIcon" :is="item.data.logo" class="media-icon" />
              <Image v-else-if="item.data.logo" :src="item.data.logo" :alt="String(item.data.main)" class="media-img" />
              <component v-else-if="defaultIcon" :is="defaultIcon" class="media-icon" />
            </div>

            <div class="item-content">
              <slot name="main" :item="item.data.raw">
                <div class="main-text text-truncate">
                  {{ item.data.main }}
                </div>
              </slot>
              <div v-if="item.data.sub" class="sub-text text-truncate">
                {{ item.data.sub }}
              </div>
            </div>

            <div v-if="$slots.actions" class="item-actions">
              <slot name="actions" :item="item.data.raw" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>


<style scoped>
.list-scroll-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
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
  transition: all 0.2s;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
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
  text-overflow: ellipsis
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
}
</style>
