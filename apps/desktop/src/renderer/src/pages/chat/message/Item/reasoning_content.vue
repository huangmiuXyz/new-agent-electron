<template>
  <div
    class="reasoning-block"
    :class="{ 'is-open': isReasoningExpanded }"
    @contextmenu="openReasoningContextMenu"
  >
    <div class="reasoning-header" @click="toggleReasoning">
      <div class="reasoning-label">
        <span class="reasoning-mark" aria-hidden="true">
          <Bulb class="reasoning-bulb" />
        </span>
        <span class="reasoning-text">思考过程</span>
      </div>
      <svg class="reasoning-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256"
        fill="currentColor">
        <path
          d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z">
        </path>
      </svg>
    </div>
    <div class="reasoning-body" v-show="isReasoningExpanded">
      <VirtualParagraphText
        class="reasoning-virtual-text"
        :text="reasoning_content"
        :height="reasoningViewportHeight"
        split-mode="blank-line"
        :font-size="11"
        :line-height="17"
        :paragraph-padding-block="4"
        :paragraph-gap="2"
        :min-paragraph-height="21"
        stick-to-bottom
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { estimateParagraphHeight, splitTextIntoParagraphs } from '@renderer/composables/useParagraphVirtualText'

const { display } = storeToRefs(useSettingsStore())
const Bulb = useIcon('Bulb')
const Copy = useIcon('Copy')
const { showContextMenu } = useContextMenu()

const props = defineProps<{ reasoning_content: string }>()

const isReasoningExpanded = ref(display.value.expandThoughtByDefault)

const reasoningViewportHeight = computed(() => {
  const paragraphs = splitTextIntoParagraphs(props.reasoning_content)
  const estimatedHeight = paragraphs.reduce(
    (total, paragraph) =>
      total +
      estimateParagraphHeight(paragraph.text, {
        containerWidth: 520,
        fontSize: 11,
        lineHeight: 17,
        paddingBlock: 4,
        gap: 2,
        minHeight: 21
      }),
    0
  )

  return Math.min(Math.max(estimatedHeight, 48), isMobile.value ? 260 : 360)
})

const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

const copyReasoningContent = () => {
  const text = props.reasoning_content.trim()
  if (!text) {
    messageApi.warning('暂无可复制的思考过程')
    return
  }

  copyText(text)
}

const openReasoningContextMenu = (event: MouseEvent) => {
  const hasReasoningContent = props.reasoning_content.trim().length > 0

  showContextMenu(event, [
    {
      label: '复制思考过程',
      icon: Copy,
      disabled: !hasReasoningContent,
      onClick: copyReasoningContent
    }
  ])
}
</script>

<style scoped>
.reasoning-block {
  width: 100%;
  max-width: 100%;
  margin: 2px 0 6px;
}

.reasoning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 20px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  transition: background-color 0.2s;
}

.reasoning-header:hover {
  background-color: var(--bg-hover);
}

.reasoning-label {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.reasoning-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reasoning-mark {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex: none;
  opacity: 0.8;
}

.reasoning-bulb {
  width: 12px;
  height: 12px;
}

.reasoning-toggle-icon {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.reasoning-block.is-open .reasoning-toggle-icon {
  transform: rotate(180deg);
}

.reasoning-body {
  margin: 2px 0 2px 6px;
  padding: 4px 6px 4px 10px;
  color: var(--text-secondary);
  background-color: transparent;
  border-top: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border-left: 2px solid var(--border-color-light);
  margin-left: 4px;
}

.reasoning-virtual-text {
  color: var(--text-secondary);
  font-family: inherit;
  scrollbar-width: thin;
}

.reasoning-virtual-text :deep(.virtual-paragraph-text__paragraph) {
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  .reasoning-virtual-text {
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
