<script setup lang="ts" generic="T extends Record<string, any>">

interface Props {
  items: T[]
  title?: string
  activeId?: string

  // 状态配置 (New)
  loading?: boolean
  emptyText?: string

  // 字段配置
  keyField?: string
  mainField?: string
  subField?: string
  logoField?: string

  // 功能配置
  selectable?: boolean
  variant?: 'default' | 'card'
  showHeader?: boolean
  renderHeader?: (item: T) => string
  isSelected?: (item: T) => boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,        // 默认为不加载
  emptyText: '暂无数据',  // 默认空提示
  keyField: 'id',
  mainField: 'name',
  subField: '',
  logoField: 'logo',
  selectable: true,
  variant: 'default',
  showHeader: false
})

const emit = defineEmits<{
  select: [id: string]
  contextmenu: [event: MouseEvent, id: string]
}>()

const viewItems = computed(() => {
  const items = props.items.map((item, index) => {
    const key = item[props.keyField] ?? JSON.stringify(item)
    const logo = item[props.logoField]
    let groupTitle = ''
    if (props.showHeader && props.renderHeader) {
      const cur = props.renderHeader(item)
      const prev = index > 0 ? props.renderHeader(props.items[index - 1]!) : null
      if (index === 0 || cur !== prev) groupTitle = cur
    }

    return {
      raw: item,
      key,
      main: item[props.mainField] ?? key,
      sub: props.subField ? item[props.subField] : '',
      logo,
      isIcon: typeof logo === 'object' || typeof logo === 'function',
      isActive: props.isSelected?.(item) || props.activeId === key,
      groupTitle
    }
  })

  return items.map((item, index) => {
    let isLastInGroup = false

    if (props.showHeader && props.renderHeader) {
      const currentGroup = item.groupTitle
      const nextItem = index < items.length - 1 ? items[index + 1] : null
      const nextGroup = nextItem ? (props.renderHeader!(nextItem.raw)) : null

      isLastInGroup = !nextItem || (currentGroup !== nextGroup)
    } else {
      isLastInGroup = index === items.length - 1
    }

    return {
      ...item,
      isLastItem: isLastInGroup
    }
  })
})

const handleAction = (type: 'select' | 'contextmenu', item: typeof viewItems.value[0], e?: MouseEvent) => {
  if (type === 'select' && props.selectable) emit('select', item.key)
  if (type === 'contextmenu' && e) emit('contextmenu', e, item.key)
}
</script>

<template>
  <div class="list-container" :class="[`variant-${variant}`]">
    <div v-if="title" class="list-title">
      <div>{{ title }}</div>
      <div class="list-title-actions">
        <slot name="title-tool"></slot>
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
        <template v-for="item in viewItems" :key="item.key">
          <div v-if="item.groupTitle" class="group-header">{{ item.groupTitle }}</div>
          <div class="list-item" :class="{ 'is-active': item.isActive, 'is-last': item.isLastItem }"
            @click="handleAction('select', item)" @contextmenu="handleAction('contextmenu', item, $event)">
            <div v-if="item.logo" class="item-media">
              <component v-if="item.isIcon" :is="item.logo" class="media-icon" />
              <Image v-else :src="item.logo" :alt="String(item.main)" class="media-img" />
            </div>
            <div class="item-content">
              <slot name="main" :item="item.raw">
                <div class="main-text text-truncate">{{ item.main }}</div>
              </slot>
              <div v-if="item.sub" class="sub-text text-truncate">{{ item.sub }}</div>
            </div>
            <div v-if="$slots.actions" class="item-actions">
              <slot name="actions" :item="item.raw"></slot>
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
  color: var(--text-tertiary, #999);
}

.empty-text {
  font-size: 13px;
  user-select: none;
}

.list-container {
  height: 100%;
  background-color: #fff;
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
  background-color: var(--bg-active, #f2f8ff);
  color: var(--accent-color);
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
