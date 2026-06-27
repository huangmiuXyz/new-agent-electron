<script setup lang="ts">
import type { SavedAppRecord } from '@renderer/stores/my-apps'
import { isMobile } from '@renderer/composables/useDeviceType'

interface Props {
  apps: SavedAppRecord[]
  activeAppId: string
}

defineProps<Props>()

const emit = defineEmits<{
  select: [appId: string]
  contextmenu: [event: MouseEvent, appId: string]
}>()

const handleSelect = (appId: string) => {
  emit('select', appId)
}

const handleContextMenu = (event: MouseEvent, appId: string) => {
  emit('contextmenu', event, appId)
}
</script>

<template>
  <div class="my-apps-sidebar" :class="{ 'is-mobile': isMobile }">
    <List
      class="my-apps-sidebar-list"
      :items="apps"
      :active-id="activeAppId"
      :key-field="'id'"
      :main-field="'name'"
      :sub-field="'description'"
      :empty-text="'暂无应用'"
      @select="handleSelect"
      @contextmenu="handleContextMenu"
    >
      <template #empty>
        <div class="sidebar-empty">
          <div class="sidebar-empty-title">暂无应用</div>
          <div class="sidebar-empty-desc">保存后会显示在这里</div>
        </div>
      </template>

      <template #main="{ item }">
        <div class="sidebar-app-main">
          <div class="sidebar-app-head">
            <span class="sidebar-app-icon">{{ item.iconEmoji }}</span>
            <span class="sidebar-app-name text-truncate">{{ item.name }}</span>
          </div>
        </div>
      </template>
    </List>
  </div>
</template>

<style scoped>
.my-apps-sidebar:not(.is-mobile) {
  width: 100%;
  height: 100%;
  padding: var(--sidebar-container-pad);
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar-surface);
  border-right: 1px solid var(--sidebar-border);
}

.my-apps-sidebar:not(.is-mobile) :deep(.my-apps-sidebar-list),
.my-apps-sidebar:not(.is-mobile) :deep(.list-container),
.my-apps-sidebar:not(.is-mobile) :deep(.list-scroll-area) {
  background: transparent;
}

.my-apps-sidebar:not(.is-mobile) :deep(.list-title) {
  padding: 4px 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.08px;
}

.my-apps-sidebar:not(.is-mobile) :deep(.list-item) {
  align-items: flex-start;
  margin-bottom: var(--sidebar-gap);
  background: transparent;
}

.my-apps-sidebar:not(.is-mobile) :deep(.list-item:hover) {
  background: var(--bg-hover);
}

.my-apps-sidebar:not(.is-mobile) :deep(.list-item.is-active) {
  background: var(--bg-active);
}

.my-apps-sidebar.is-mobile {
  height: 100%;
  background: var(--bg-settings-mobile-sidebar);
}

.my-apps-sidebar.is-mobile :deep(.list-container) {
  background: transparent;
  padding: 12px;
}

.sidebar-empty {
  padding: 10px 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  justify-content: flex-start;
  min-height: 0;
  color: var(--text-secondary);
}

.sidebar-empty-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.sidebar-empty-desc {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.sidebar-app-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-app-head {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-app-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  font-size: 13px;
}

.sidebar-app-name {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
}

.my-apps-sidebar:not(.is-mobile) :deep(.list-item.is-active .sidebar-app-name) {
  font-weight: 600;
}

.sidebar-app-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
