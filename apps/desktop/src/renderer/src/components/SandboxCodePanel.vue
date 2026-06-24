<script setup lang="ts">
import AppImage from './Image.vue'
import SandboxCodeEditor from './SandboxCodeEditor.vue'
import { getSandboxFileLanguage } from '@renderer/services/sandbox'

const props = defineProps<{
  fileTabs: { path: string; isActive: boolean; isDirty: boolean; name: string }[]
  activeFile: any
  currentTabFilePath: string
  activeFileContent: string
  activeLanguage: string
  isActiveImageFile: boolean
  isActiveBinaryFile: boolean
  currentTab: string
  gitDiffView: any
  gitSelectedEntry: any
}>()

const emit = defineEmits<{
  'update:activeFileContent': [value: string]
  'update:activeFilePath': [value: string]
  closeFileTab: [path: string]
  openTabContextMenu: [event: MouseEvent, path: string]
}>()
</script>

<template>
  <div class="canvas-code">
    <template v-if="currentTab === 'git'">
      <div class="canvas-panel-surface canvas-code-editor-shell">
        <div v-if="gitSelectedEntry" class="canvas-file-tabs"><button type="button"
            class="canvas-file-tab active"><span class="canvas-file-tab-name">{{
              gitSelectedEntry.path.split('/').filter(Boolean).pop() || gitSelectedEntry.path || 'untitled'
            }}</span></button></div>
        <div class="canvas-code-editor">
          <SandboxCodeEditor v-if="gitDiffView" :model-value="gitDiffView.modifiedText"
            :original-model-value="gitDiffView.originalText" :path="gitDiffView.modifiedPath"
            :original-path="gitDiffView.originalPath" :language="getSandboxFileLanguage(gitDiffView.path)"
            read-only />
        </div>
      </div>
    </template>
    <template v-else-if="activeFile">
      <div class="canvas-panel-surface canvas-code-editor-shell">
        <div v-if="fileTabs.length > 0" class="canvas-file-tabs">
          <button v-for="tab in fileTabs" :key="tab.path" type="button" class="canvas-file-tab"
            :class="{ active: tab.isActive }" @click="$emit('update:activeFilePath', tab.path)"
            @contextmenu="$emit('openTabContextMenu', $event, tab.path)">
            <span class="canvas-file-tab-name">{{ tab.name }}</span>
            <span v-if="tab.isDirty" class="canvas-file-tab-dirty"></span>
            <span class="canvas-file-tab-close" @click.stop="$emit('closeFileTab', tab.path)">x</span>
          </button>
        </div>
        <div v-if="isActiveImageFile" class="canvas-image-preview">
          <AppImage :src="activeFile.content" preview class="canvas-image-preview-media" />
        </div>
        <div v-else-if="isActiveBinaryFile" class="canvas-binary-preview"><strong>二进制文件</strong><span>{{
          currentTabFilePath }}</span>
          <p>该文件已保存在画布工作区中，可直接在终端或 exec_command_canvas 中使用。</p>
        </div>
        <div v-else class="canvas-code-editor">
          <SandboxCodeEditor :model-value="activeFileContent" :path="currentTabFilePath" :language="activeLanguage"
            @update:model-value="$emit('update:activeFileContent', $event)" />
        </div>
      </div>
    </template>
    <div v-else class="canvas-empty-state">当前没有打开的文件。请先在左侧选择文件，或新建一个文件。</div>
  </div>
</template>

<style scoped>
.canvas-code {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1
}

.canvas-panel-surface {
  min-height: 0;
  height: 100%;
  background: var(--sandbox-surface-bg);
  border: 1px solid rgba(var(--text-rgb), 0.08);
  border-radius: 0;
  overflow: hidden
}

.canvas-code-editor-shell {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column
}

.canvas-code-editor {
  flex: 1;
  overflow: hidden;
  color: #d4d4d4
}

.canvas-file-tabs {
  display: flex;
  align-items: stretch;
  gap: 1px;
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: rgba(255, 255, 255, 0.02);
  overflow-x: auto
}

.canvas-file-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 0;
  background: rgba(var(--text-rgb), 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0
}

.canvas-file-tab.active {
  background: color-mix(in srgb, var(--bg-card) 86%, transparent);
  color: var(--text-primary)
}

.canvas-file-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}

.canvas-file-tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #d97706;
  flex-shrink: 0
}

.canvas-file-tab-close {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  color: var(--text-tertiary)
}

.canvas-file-tab-close:hover {
  background: rgba(var(--text-rgb), 0.08);
  color: var(--text-primary)
}

.canvas-image-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(45deg, rgba(var(--text-rgb), 0.04) 25%, transparent 25%, transparent 75%, rgba(var(--text-rgb), 0.04) 75%), linear-gradient(45deg, rgba(var(--text-rgb), 0.04) 25%, transparent 25%, transparent 75%, rgba(var(--text-rgb), 0.04) 75%);
  background-position: 0 0, 12px 12px;
  background-size: 24px 24px
}

.canvas-image-preview-media {
  width: 100%;
  height: 100%
}

.canvas-image-preview-media :deep(img) {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain
}

.canvas-binary-preview {
  height: 100%;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary)
}

.canvas-binary-preview strong {
  font-size: 16px;
  color: var(--text-primary)
}

.canvas-binary-preview span {
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all
}

.canvas-binary-preview p {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.6
}

.canvas-empty-state {
  display: grid;
  place-items: center;
  flex: 1;
  border: 1px dashed rgba(var(--text-rgb), 0.1);
  border-radius: 0;
  color: var(--text-tertiary);
  text-align: center;
  padding: 24px;
  background: rgba(255, 255, 255, 0.02)
}
</style>
