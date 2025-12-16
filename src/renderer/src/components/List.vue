<script setup lang="ts" generic="T extends Record<string, any>">
import { computed } from 'vue'

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
  showHeader: false
})

const emit = defineEmits<{
  select: [id: string]
  contextmenu: [event: MouseEvent, id: string]
}>()

const viewItems = computed(() => props.items.map((item) => {
  const key = item[props.keyField] ?? JSON.stringify(item)
  const logo = item[props.logoField]

  return {
    raw: item,
    key,
    main: item[props.mainField] ?? key,
    sub: props.subField ? item[props.subField] : '',
    logo,
    isIcon: typeof logo === 'object' || typeof logo === 'function',
    isActive: props.isSelected?.(item) || props.activeId === key
  }
}))

const handleAction = (type: 'select' | 'contextmenu', item: typeof viewItems.value[0], e?: MouseEvent) => {
  if (type === 'select' && props.selectable) emit('select', item.key)
  if (type === 'contextmenu' && e) emit('contextmenu', e, item.key)
}
</script>

<template>
  <div class="list-container">
    <div v-if="title" class="list-title">
      <div>{{ title }}</div>
      <div class="list-title-actions">
        <slot name="title-tool"></slot>
      </div>
    </div>

    <div class="list-scroll-area">
      <div v-if="loading" class="state-container">
        <slot name="loading">
          <div class="loading-spinner"></div>
        </slot>
      </div>

      <div v-else-if="viewItems.length === 0" class="state-container">
        <slot name="empty">
          <div class="empty-text">{{ emptyText }}</div>
        </slot>
      </div>

      <template v-else>
        <template v-for="item in viewItems" :key="item.key">
          <div class="list-item" :class="{ 'is-active': item.isActive }" @click="handleAction('select', item)"
            @contextmenu="handleAction('contextmenu', item, $event)">
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
  min-height: 60px;
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

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-subtle, #eee);
  border-top-color: var(--accent-color, #0066ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.list-container {
  height: 100%;
  background-color: #fff;
  z-index: 2;
  display: flex;
  flex-direction: column;
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
</style>
