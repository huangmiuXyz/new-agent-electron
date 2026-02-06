<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import Loading from '@renderer/components/Loading.vue'

const props = defineProps<{
  message: BaseMessage
}>()

const { display } = storeToRefs(useSettingsStore())
const isCollapsed = ref(!display.value.expandToolsByDefault)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const isCompressed = computed(() => {
  return props.message.metadata?.isCompressedContext ||
    props.message.parts?.some(p => p.type === 'text' && p.text?.includes('[上下文已压缩]'))
})

const isCompressing = computed(() => {
  // 优先根据 metadata.loading 判断，其次根据文本内容
  return props.message.metadata?.loading ||
    props.message.parts?.some(p => p.type === 'text' && p.text?.includes('🔃 正在压缩上下文'))
})

const messageText = computed(() => {
  return props.message.parts
    ?.filter(p => p.type === 'text')
    .map(p => p.text)
    .join('') || ''
})

// 使用 useIcon 获取图标
const { InfoCircle, Check, ChevronDown } = useIcon(['InfoCircle', 'Check', 'ChevronDown'])
</script>

<template>
  <div class="msg-row system-row">
    <div class="system-card" :class="{ 'compressed': isCompressed, 'compressing': isCompressing }">
      <div class="system-header" @click="toggleCollapse">
        <div class="system-icon">
          <Loading v-if="isCompressing" size="mini" />
          <Check v-else-if="isCompressed"  />
          <InfoCircle v-else />
        </div>
        <div class="system-label" v-if="isCompressing">正在压缩上下文</div>
        <div class="system-label" v-else-if="isCompressed">上下文已压缩</div>
        <div class="system-label" v-else>系统消息</div>
        <div class="collapse-icon" :class="{ collapsed: isCollapsed }">
          <component :is="ChevronDown" />
        </div>
      </div>
      <div class="system-content" :class="{ collapsed: isCollapsed }">
        <div class="system-text">{{ messageText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  padding: 4px 0px;
  justify-content: flex-start;
}

.system-row {
  justify-content: flex-start;
  width: 100%;
  padding: 8px 20px;
}

.system-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  background-color: var(--bg-hover);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
}

.system-card.compressed {
  background-color: rgba(var(--accent-rgb), 0.08);
  border-color: rgba(var(--accent-rgb), 0.3);
}

.system-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background-color: var(--bg-hover);
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.system-card:not(.collapsed) .system-header {
  border-bottom-color: var(--border-color-light);
}

.system-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.system-card.compressed .system-icon,
.system-card.compressing .system-icon {
  color: var(--accent-color);
}

.system-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.system-card.compressed .system-label,
.system-card.compressing .system-label {
  color: var(--accent-color);
}

.collapse-icon {
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.system-content {
  padding: 8px 12px;
  background-color: var(--bg-card);
  max-height: 400px;
  overflow-y: auto;
  transition: all 0.2s ease;
}

.system-content.collapsed {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
  opacity: 0;
}

.system-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.system-card.compressed .system-text {
  color: var(--text-sub);
}

.system-icon :deep(.loading-container) {
  flex-direction: row;
  gap: 0;
}
</style>
