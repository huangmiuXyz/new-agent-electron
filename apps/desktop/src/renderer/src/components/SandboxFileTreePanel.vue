<script setup lang="ts">
defineProps<{
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
        <span class="sandbox-tree-file-icon" :class="[`type-${item.data.type}`]"><span
            class="sandbox-tree-file-glyph"></span></span>
        <span class="sandbox-tree-label">{{ item.data.name }}</span>
        <span v-if="item.data.type === 'file'" class="sandbox-tree-badge">{{
          (item.data.name.split('.').pop()?.trim().toUpperCase() || 'TXT').slice(0, 4) }}</span>
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

.sandbox-tree-file-glyph {
  display: block;
  width: 12px;
  height: 14px;
  position: relative;
  border-radius: 2px
}

.sandbox-tree-file-icon.type-directory .sandbox-tree-file-glyph {
  width: 13px;
  height: 10px;
  margin-top: 1px;
  border-radius: 2px;
  background: #dcb67a
}

.sandbox-tree-file-icon.type-directory .sandbox-tree-file-glyph::before {
  content: '';
  position: absolute;
  left: 0;
  top: -3px;
  width: 7px;
  height: 4px;
  border-radius: 2px 2px 0 0;
  background: #c89d58
}

.sandbox-tree-file-icon.type-file .sandbox-tree-file-glyph {
  background: linear-gradient(180deg, #89c7ff 0%, #5aa9ff 100%);
  clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 0 100%)
}

.sandbox-tree-file-icon.type-file .sandbox-tree-file-glyph::before {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.55);
  clip-path: polygon(0 0, 100% 100%, 100% 0)
}

.sandbox-tree-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis
}

.sandbox-tree-badge {
  flex-shrink: 0;
  color: var(--sandbox-sidebar-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase
}

.sandbox-tree-row.active .sandbox-tree-badge {
  color: color-mix(in srgb, var(--sandbox-tree-active-text) 72%, transparent)
}
</style>
