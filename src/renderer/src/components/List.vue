<script setup lang="ts" generic="T extends Record<string, any>">
import { computed } from 'vue'

interface Props {
  items: T[]
  type?: 'gap' | 'ungap'
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
  type: 'gap',
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

const viewItems = computed(() => props.items.map((item, index) => {
  const key = item[props.keyField] ?? JSON.stringify(item)
  const logo = item[props.logoField]
  let groupTitle = ''
  if (props.type === 'ungap' && props.showHeader && props.renderHeader) {
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
    isActive: props.type === 'gap' ? props.activeId === key : props.isSelected?.(item),
    groupTitle
  }
}))

const handleAction = (type: 'select' | 'contextmenu', item: typeof viewItems.value[0], e?: MouseEvent) => {
  if (type === 'select' && props.selectable) emit('select', item.key)
  if (type === 'contextmenu' && e) emit('contextmenu', e, item.key)
}
</script>

<template>
  <div class="list-container" :class="[`mode-${type}`]">
    <div v-if="title && type === 'gap'" class="list-title">{{ title }}</div>

    <div class="list-scroll-area">
      <!-- 1. Loading 状态 -->
      <div v-if="loading" class="state-container">
        <slot name="loading">
          <div class="loading-spinner"></div>
        </slot>
      </div>

      <!-- 2. Empty 状态 -->
      <div v-else-if="viewItems.length === 0" class="state-container">
        <slot name="empty">
          <div class="empty-text">{{ emptyText }}</div>
        </slot>
      </div>

      <!-- 3. 数据列表 -->
      <template v-else>
        <template v-for="item in viewItems" :key="item.key">
          <div v-if="item.groupTitle" class="group-header">{{ item.groupTitle }}</div>
          <div class="list-item" :class="{ 'is-active': item.isActive }" @click="handleAction('select', item)"
            @contextmenu="handleAction('contextmenu', item, $event)">
            <div v-if="item.logo" class="item-media">
              <component v-if="item.isIcon" :is="item.logo" class="media-icon" />
              <img v-else :src="item.logo" :alt="String(item.main)" class="media-img" />
            </div>
            <div class="item-content">
              <div class="main-text text-truncate">{{ item.main }}</div>
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
/* ====================
   通用基础样式 (Base)
   ==================== */
.list-container {
  display: flex;
  flex-direction: column;
}

.list-scroll-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
  /* 确保状态容器定位正常 */
  min-height: 60px;
  /* 防止高度坍塌 */
}

/* ====================
   状态样式 (Loading / Empty)
   ==================== */
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

/* ... 以下保持原有的 list-item 等样式不变 ... */

.list-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
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

/* ====================
   模式：Gap (侧边栏风格)
   ==================== */
.mode-gap {
  width: 260px;
  border-right: 1px solid var(--border-subtle);
  padding: 12px;
  height: 100%;
  background-color: transparent;
}

.mode-gap .list-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  padding-left: 4px;
}

.mode-gap .list-item {
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
}

.mode-gap .list-item:hover {
  background-color: var(--bg-hover);
}

.mode-gap .list-item.is-active {
  background-color: var(--bg-active, #f2f8ff);
  color: var(--accent-color);
}

.mode-gap .item-media {
  display: flex;
}

.mode-gap .sub-text {
  display: none;
}

.mode-gap .main-text {
  font-size: 13px;
  font-weight: 500;
}

.mode-gap .media-img {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}

.mode-gap .media-icon {
  width: 24px;
  height: 24px;
  font-size: 16px;
  color: var(--text-secondary);
}

/* ====================
   模式：Ungap (列表/卡片风格)
   ==================== */
.mode-ungap {
  width: 100%;
}

.mode-ungap .group-header {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding: 6px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mode-ungap .list-item {
  padding: 6px 8px;
  margin-bottom: 1px;
  justify-content: space-between;
}

.mode-ungap .list-item:first-of-type {
  border-radius: 6px 6px 0 0;
}

.mode-ungap .group-header+.list-item {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.mode-ungap .list-item:last-of-type {
  border-radius: 0 0 6px 6px;
  margin-bottom: 0;
}

.mode-ungap .list-item:only-of-type {
  border-radius: 6px;
}

.mode-ungap .group-header:first-of-type {
  border-radius: 6px 6px 0 0;
}

.mode-ungap .list-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.mode-ungap .list-item.is-active {
  background: var(--bg-active, var(--accent-color));
}

.mode-ungap .list-item.is-active .main-text,
.mode-ungap .list-item.is-active .sub-text {
  color: #fff !important;
}

.mode-ungap .item-media {
  display: none;
}

.mode-ungap .main-text {
  font-size: 12px;
  font-weight: 500;
}

.mode-ungap .sub-text {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 1px;
}
</style>