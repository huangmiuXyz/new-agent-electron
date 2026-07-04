<script setup lang="ts">
import { computed, type VNode } from 'vue'
import { getFileIcon, getFileIconByName } from '@renderer/utils/fileIcons'

const props = defineProps<{
  sandboxTreeContainerProps: Record<string, any>
  sandboxTreeWrapperProps: Record<string, any>
  virtualSandboxTreeRows: any[]
  activeFilePath: string
  dragTargetDirectoryPath: string
  draggingCanvasFilePath: string
}>()

const emit = defineEmits<{
  blankContextMenu: [event: MouseEvent]
  treeRowClick: [data: any]
  treeRowContextMenu: [event: MouseEvent, data: any]
  treeRowDragStart: [data: any, event: DragEvent]
  treeRowDragEnd: [event: DragEvent]
  directoryDragEnter: [data: any, event: DragEvent]
  directoryDragOver: [data: any, event: DragEvent]
  directoryDragLeave: [data: any, event: DragEvent]
  directoryDrop: [data: any, event: DragEvent]
}>()

// 缓存文件夹图标 VNode
const folderIcon = getFileIconByName('folder').vnode
const folderOpenIcon = getFileIconByName('folder-open').vnode

/** 根据行数据返回图标 VNode */
const getRowIcon = (row: any): VNode => {
  if (row.data.type === 'directory') {
    return row.data.isExpanded ? folderOpenIcon : folderIcon
  }
  return getFileIcon(row.data.path || row.data.name).vnode
}

// 预计算每行的图标 VNode，按 id 缓存
const rowIcons = computed(() => {
  const map = new Map<string, VNode>()
  for (const row of props.virtualSandboxTreeRows) {
    map.set(row.data.id, getRowIcon(row))
  }
  return map
})
</script>

<template>
  <div class="sandbox-tree" v-bind="sandboxTreeContainerProps" @contextmenu.prevent="$emit('blankContextMenu', $event)">
    <div class="sandbox-tree-wrapper" v-bind="sandboxTreeWrapperProps">
      <button v-for="item in virtualSandboxTreeRows" :key="item.data.id" type="button"
        class="sandbox-tree-row"
        :class="{ active: item.data.type === 'file' && item.data.path === activeFilePath, directory: item.data.type === 'directory', 'drop-target': item.data.type === 'directory' && item.data.path === dragTargetDirectoryPath, dragging: item.data.path === draggingCanvasFilePath }"
        :style="{ paddingLeft: `${8 + item.data.depth * 14}px`, height: `22px` }"
        @click="$emit('treeRowClick', item.data)"
        @contextmenu.prevent="$emit('treeRowContextMenu', $event, item.data)"
        :draggable="item.data.type === 'file' || item.data.type === 'directory'"
        @dragstart="$emit('treeRowDragStart', item.data, $event)"
        @dragend="$emit('treeRowDragEnd', $event)"
        @dragenter="$emit('directoryDragEnter', item.data, $event)"
        @dragover="$emit('directoryDragOver', item.data, $event)"
        @dragleave="$emit('directoryDragLeave', item.data, $event)"
        @drop="$emit('directoryDrop', item.data, $event)">
        <span class="sandbox-tree-chevron">{{ item.data.type === 'directory' && item.data.hasChildren ?
          item.data.isExpanded ? '▾' : '▸' : '' }}</span>
        <span class="sandbox-tree-file-icon">
          <component :is="rowIcons.get(item.data.id)" v-if="rowIcons.has(item.data.id)" />
        </span>
        <span class="sandbox-tree-label">{{ item.data.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sandbox-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 0 8px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--sandbox-sidebar-faint) 72%, transparent) transparent
}

.sandbox-tree::-webkit-scrollbar {
  width: 10px;
  height: 10px
}

.sandbox-tree::-webkit-scrollbar-track {
  background: transparent
}

.sandbox-tree::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--sandbox-sidebar-faint) 68%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box
}

.sandbox-tree::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--sandbox-sidebar-text) 54%, transparent);
  border: 2px solid transparent;
  background-clip: padding-box
}

.sandbox-tree-wrapper {
  min-width: 100%
}

.sandbox-tree-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--sandbox-sidebar-muted);
  text-align: left;
  padding: 0 8px 0 0;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  border-radius: 0;
  min-height: 22px;
  height: 22px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative
}

.sandbox-tree-row.directory {
  color: var(--sandbox-sidebar-text)
}

.sandbox-tree-row.active {
  background: var(--sandbox-tree-active-bg);
  color: var(--sandbox-tree-active-text)
}

.sandbox-tree-row:hover {
  background: var(--sandbox-tree-hover)
}

.sandbox-tree-row.active:hover {
  background: var(--sandbox-tree-active-bg-hover)
}

.sandbox-tree-row.dragging {
  opacity: 0.56
}

.sandbox-tree-row.drop-target {
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.32)
}

.sandbox-tree-chevron {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--sandbox-sidebar-faint)
}

.sandbox-tree-file-icon {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  flex-shrink: 0
}

.sandbox-tree-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis
}
</style>
