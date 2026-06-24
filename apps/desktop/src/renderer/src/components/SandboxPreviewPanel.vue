<script setup lang="ts">
import HtmlPreview from './HtmlPreview.vue'

defineProps<{
  isUsingTempWorkspace: boolean
  previewReady: boolean
  previewDocument: string
  previewChannelId: string
  sandboxLogsHeight: number
  sandboxLogsCollapsed: boolean
  previewLogs: { id: string; kind: string; level?: string; text: string }[]
}>()

const emit = defineEmits<{
  sandboxEvent: [event: any]
  'update:sandboxLogsHeight': [value: number]
  'update:sandboxLogsCollapsed': [value: boolean]
}>()
</script>

<template>
  <div class="canvas-preview">
    <div class="canvas-panel-surface canvas-preview-frame">
      <div v-if="!isUsingTempWorkspace" class="canvas-empty-state">预览仅支持临时工作区。当前画布正跟随工作路径，可在未设置工作路径时使用预览。</div>
      <HtmlPreview v-else-if="previewReady" :srcdoc="previewDocument" :channel-id="previewChannelId"
        @sandbox-event="$emit('sandboxEvent', $event)" />
      <div v-else class="canvas-empty-state">当前预览尚未准备好。</div>
    </div>
    <ResizeBox :height="sandboxLogsHeight" :is-collapsed="sandboxLogsCollapsed" direction="vertical"
      handle-position="top" :min-size="120" :max-size="360" class="sandbox-logs-resize"
      @update:height="$emit('update:sandboxLogsHeight', $event)"
      @update:is-collapsed="$emit('update:sandboxLogsCollapsed', $event)">
      <div class="canvas-panel-surface sandbox-logs">
        <div class="canvas-surface-header"><span class="canvas-surface-title">TERMINAL</span><span
            class="canvas-surface-meta">Sandbox runtime</span></div>
        <div v-if="previewLogs.length === 0" class="sandbox-logs-empty">等待预览输出...</div>
        <div v-else class="sandbox-log-list">
          <div v-for="item in previewLogs" :key="item.id" class="sandbox-log-item"
            :class="[`kind-${item.kind}`, item.level ? `level-${item.level}` : '']">{{ item.text }}</div>
        </div>
      </div>
    </ResizeBox>
  </div>
</template>

<style scoped>
.canvas-preview {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px
}

.canvas-panel-surface {
  min-height: 0;
  height: 100%;
  background: var(--sandbox-surface-bg);
  border: 1px solid rgba(var(--text-rgb), 0.08);
  border-radius: 0;
  overflow: hidden
}

.canvas-surface-header {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: var(--sandbox-surface-header-bg);
  font-size: 11px
}

.canvas-surface-title {
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  font-weight: 600
}

.canvas-surface-meta {
  color: var(--text-tertiary);
  font-family: Menlo, Monaco, 'Courier New', monospace;
  font-size: 10px
}

.canvas-preview-frame {
  flex: 1;
  display: flex;
  flex-direction: column
}

.sandbox-logs {
  background: var(--sandbox-log-bg);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column
}

.sandbox-logs-empty,
.sandbox-log-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px 12px;
  font-family: Menlo, Monaco, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.55
}

.sandbox-logs-empty {
  color: var(--text-tertiary)
}

.sandbox-log-item {
  color: var(--sandbox-log-text);
  white-space: pre-wrap;
  word-break: break-word
}

.sandbox-log-item+.sandbox-log-item {
  margin-top: 8px
}

.sandbox-log-item.kind-error,
.sandbox-log-item.level-error {
  color: var(--color-danger)
}

.sandbox-log-item.level-warn {
  color: #d97706
}

.sandbox-log-item.kind-ready {
  color: var(--sandbox-log-ready)
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
