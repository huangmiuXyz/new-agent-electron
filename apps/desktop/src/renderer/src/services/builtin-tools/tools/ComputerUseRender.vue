<script setup lang="ts">
const props = defineProps<{
  args: any
  result: any
  tool_part: any
}>()

const actions = computed(() => {
  if (!props.args) return []
  if (Array.isArray(props.args.actions)) return props.args.actions
  if (props.args.action) return [props.args.action]
  return []
})

const screenshotUrl = computed(() => {
  const content = props.result?.toolResult?.content
  if (!Array.isArray(content)) return ''
  const imagePart = content.find((c: any) => c.type === 'image-url')
  return imagePart?.url || ''
})

const screenshotMeta = computed(() => {
  const content = props.result?.toolResult?.content
  if (!Array.isArray(content)) return null
  const textPart = content.find((c: any) => c.type === 'text')
  return textPart?.text || ''
})

const formatAction = (action: any) => {
  if (!action) return ''
  switch (action.type) {
    case 'screenshot':
      return '截图'
    case 'click':
      return `点击 (${action.x}, ${action.y}${action.button && action.button !== 'left' ? `, ${action.button}` : ''})`
    case 'double_click':
      return `双击 (${action.x}, ${action.y})`
    case 'scroll':
      return `滚动 (${action.x}, ${action.y}) delta=(${action.scrollX ?? 0}, ${action.scrollY ?? 0})`
    case 'keypress':
      return `按键 ${(action.keys || []).join('+')}`
    case 'type':
      return `输入 "${action.text}"`
    case 'wait':
      return '等待 2s'
    default:
      return action.type
  }
}
</script>

<template>
  <div class="computer-use-render">
    <div v-if="actions.length" class="actions">
      <div v-for="(action, i) in actions" :key="i" class="action-item">
        <span class="action-index">{{ (i as number) + 1 }}.</span>
        <span>{{ formatAction(action) }}</span>
      </div>
    </div>
    <div v-if="screenshotMeta" class="meta">{{ screenshotMeta }}</div>
    <div v-if="screenshotUrl" class="screenshot">
      <Image :src="screenshotUrl" preview />
    </div>
  </div>
</template>

<style scoped>
.computer-use-render {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.action-item {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 8px;
  background: var(--bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
}
.action-index {
  color: var(--text-tertiary);
  margin-right: 4px;
}
.meta {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: pre-wrap;
  font-family: var(--font-mono, monospace);
}
.screenshot {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
}
.screenshot img {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
