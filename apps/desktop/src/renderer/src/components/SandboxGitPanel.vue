<script setup lang="ts">
import ModelSelector from './ModelSelector.vue'

defineProps<{
  gitCommitMessage: string
  gitSelectedPath: string
  gitEntries: any[]
  gitStatus: any
  hasGitRepo: boolean
  isGitPrimaryButtonDisabled: boolean
  gitCommitting: boolean
  gitActionLoading: boolean
  gitPrimaryButtonLabel: string
  gitPrimaryButtonLoadingLabel: string
  gitGeneratingCommitMessage: boolean
  gitCommitProviderId: string
  gitCommitModelId: string
}>()

const emit = defineEmits<{
  'update:gitCommitMessage': [value: string]
  refreshGitDiff: [path: string]
  runGitPrimaryAction: []
  'update:gitCommitProviderId': [value: string]
  'update:gitCommitModelId': [value: string]
  openGitActionsMenu: [event: MouseEvent]
  gitGenerateAfterModelPick: []
}>()

const { Refresh: RefreshIcon, Sparkles: SparklesIcon } = useIcon(['Refresh', 'Sparkles'])

const getBaseNameFromPath = (path: string) => path.split('/').filter(Boolean).pop() || path || 'untitled'
</script>

<template>
  <div class="sandbox-explorer-group-header">
    <div class="sandbox-explorer-group-header-row">
      <span class="sandbox-explorer-group-title">更改</span>
      <div v-if="true" class="canvas-git-header-actions">
        <button type="button" class="sandbox-sidebar-tool" title="刷新" @click="emit('refreshGitDiff', '')">
          <RefreshIcon />
        </button>
        <div class="canvas-git-ai-selector" :class="{ 'is-loading': gitGeneratingCommitMessage }"
          :title="gitGeneratingCommitMessage ? '生成提交信息中' : '生成提交信息'"
          @click.capture="emit('gitGenerateAfterModelPick')">
          <ModelSelector :model-id="gitCommitModelId" :provider-id="gitCommitProviderId"
            type="icon" category="text" popup-position="bottom" :icon="SparklesIcon"
            @update:model-id="$emit('update:gitCommitModelId', $event)"
            @update:provider-id="$emit('update:gitCommitProviderId', $event)" />
        </div>
        <button type="button" class="sandbox-sidebar-tool canvas-git-more-tool" :disabled="gitActionLoading"
          title="更多 Git 操作" @click="$emit('openGitActionsMenu', $event)">⋯</button>
      </div>
    </div>
  </div>
  <div class="sandbox-tree">
    <div class="canvas-git-compose">
      <textarea :value="gitCommitMessage" class="canvas-git-commit-input" rows="1"
        :placeholder="`消息 (${hasGitRepo ? `⌘Enter 在“${gitStatus?.branch || 'HEAD'}”提交` : '提交'})`"
        @input="$emit('update:gitCommitMessage', ($event.target as HTMLTextAreaElement).value)" />
      <button type="button" class="canvas-git-commit-primary" :disabled="isGitPrimaryButtonDisabled"
        @click="$emit('runGitPrimaryAction')">{{ gitCommitting || gitActionLoading ?
          gitPrimaryButtonLoadingLabel : gitPrimaryButtonLabel }}</button>
    </div>
    <button v-for="entry in gitEntries" :key="entry.path" type="button"
      class="sandbox-tree-row canvas-git-tree-row" :class="{ active: entry.path === gitSelectedPath }"
      @click="$emit('refreshGitDiff', entry.path)">
      <span class="sandbox-tree-file-icon type-file"><span class="sandbox-tree-file-glyph"></span></span>
      <span class="canvas-git-tree-name">{{ getBaseNameFromPath(entry.path) }}</span>
      <span class="canvas-git-tree-dir">{{ entry.path.split('/').filter(Boolean).slice(0, -1).join('/') || '.' }}</span>
      <span class="canvas-git-tree-code">{{ entry.untracked ? 'U' : `${entry.indexStatus}`.trim() ||
        `${entry.workingTreeStatus}`.trim() || 'M' }}</span>
    </button>
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

.sandbox-explorer-group-header {
  min-height: 26px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 1px;
  padding: 4px 8px 2px;
  color: var(--sandbox-sidebar-muted);
  font-size: 10px;
  letter-spacing: 0.06em
}

.sandbox-explorer-group-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px
}

.sandbox-explorer-group-title {
  font-weight: 700;
  font-size: 11px;
  line-height: 1
}

.sandbox-sidebar-tool {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--sandbox-sidebar-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  border-radius: 2px
}

.sandbox-sidebar-tool:disabled {
  opacity: 0.4;
  cursor: default
}

.sandbox-sidebar-tool:hover {
  background: var(--sandbox-tool-hover);
  color: var(--sandbox-sidebar-text)
}

.sandbox-sidebar-tool.active {
  background: var(--sandbox-tool-active);
  color: var(--sandbox-sidebar-text)
}

.sandbox-sidebar-tool :deep(svg) {
  width: 11px;
  height: 11px
}

.canvas-git-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0
}

.canvas-git-ai-selector {
  position: relative;
  flex-shrink: 0
}

.canvas-git-ai-selector.is-loading {
  pointer-events: none;
  opacity: 0.7
}

.canvas-git-ai-selector :deep(.btn.btn--icon.btn--sm) {
  display: grid;
  place-items: center;
  width: 18px;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  border-radius: 2px;
  color: var(--sandbox-sidebar-muted);
  line-height: 1
}

.canvas-git-ai-selector :deep(.btn.btn--icon.btn--sm:hover) {
  background: var(--sandbox-tool-hover)
}

.canvas-git-ai-selector :deep(svg) {
  display: block;
  width: 12px;
  height: 12px;
  transform: translate(.5px, .25px)
}

.canvas-git-ai-selector.is-loading :deep(.btn)::after {
  content: '…';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sandbox-sidebar-muted);
  font-size: 11px;
  font-weight: 600
}

.canvas-git-ai-selector.is-loading :deep(svg) {
  opacity: 0
}

.canvas-git-compose {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 6px 4px;
  border-bottom: 1px solid var(--sandbox-sidebar-border)
}

.canvas-git-commit-input {
  width: 100%;
  min-height: 24px;
  max-height: 48px;
  resize: none;
  border: 1px solid var(--sandbox-sidebar-border);
  background: transparent;
  color: var(--text-primary);
  padding: 3px 6px;
  font: inherit;
  line-height: 1.2
}

.canvas-git-commit-input:focus,
.canvas-git-commit-input:focus-visible {
  outline: none;
  border-color: var(--sandbox-sidebar-border);
  box-shadow: none
}

.canvas-git-commit-primary {
  height: 22px;
  border: 1px solid #0e639c;
  background: #0e639c;
  color: #fff;
  font-size: 11px;
  cursor: pointer
}

.canvas-git-commit-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed
}

.canvas-git-tree-name {
  color: var(--text-primary)
}

.canvas-git-tree-dir {
  min-width: 0;
  flex: 1;
  color: var(--sandbox-sidebar-faint);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}

.canvas-git-tree-code {
  color: #d7ba7d;
  font-size: 11px;
  font-weight: 700
}
</style>
