<script setup lang="ts">
import { useElementSize, useVirtualList } from '@vueuse/core'
import { estimateParagraphHeight, splitTextIntoParagraphs, type ParagraphBlock, type ParagraphSplitMode } from '@renderer/composables/useParagraphVirtualText'

interface VirtualParagraphTextProps {
  text: string
  height?: string | number
  splitMode?: ParagraphSplitMode
  preserveEmpty?: boolean
  trimParagraphs?: boolean
  overscan?: number
  fontSize?: number
  lineHeight?: number
  paragraphPaddingBlock?: number
  paragraphGap?: number
  minParagraphHeight?: number
  stickToBottom?: boolean
  bottomThreshold?: number
}

const props = withDefaults(defineProps<VirtualParagraphTextProps>(), {
  height: '100%',
  splitMode: 'blank-line',
  preserveEmpty: false,
  trimParagraphs: false,
  overscan: 8,
  fontSize: 14,
  lineHeight: 22,
  paragraphPaddingBlock: 12,
  paragraphGap: 8,
  minParagraphHeight: 34,
  stickToBottom: false,
  bottomThreshold: 24
})

const containerRef = ref<HTMLElement | null>(null)
const isPinnedToBottom = ref(props.stickToBottom)
const { width: containerWidth } = useElementSize(containerRef)

const paragraphs = computed<ParagraphBlock[]>(() =>
  splitTextIntoParagraphs(props.text, {
    mode: props.splitMode,
    preserveEmpty: props.preserveEmpty,
    trimParagraphs: props.trimParagraphs
  })
)

const viewportHeight = computed(() => {
  if (typeof props.height === 'number') return `${props.height}px`
  return props.height
})

const getParagraphHeight = (index: number) => {
  const paragraph = paragraphs.value[index]
  if (!paragraph) return props.minParagraphHeight

  return estimateParagraphHeight(paragraph.text, {
    containerWidth: containerWidth.value,
    fontSize: props.fontSize,
    lineHeight: props.lineHeight,
    paddingBlock: props.paragraphPaddingBlock,
    gap: props.paragraphGap,
    minHeight: props.minParagraphHeight
  })
}

const { list: virtualParagraphs, containerProps, wrapperProps, scrollTo } = useVirtualList(paragraphs, {
  itemHeight: getParagraphHeight,
  overscan: props.overscan
})

watchEffect(() => {
  containerProps.ref.value = containerRef.value
})

const isNearBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight <= props.bottomThreshold

const scrollToBottom = () => {
  const element = containerRef.value
  if (!element || paragraphs.value.length === 0) return

  scrollTo(paragraphs.value.length - 1)
  nextTick(() => {
    element.scrollTop = element.scrollHeight
    containerProps.onScroll()

    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
      containerProps.onScroll()
    })
  })
}

const handleScroll = () => {
  containerProps.onScroll()
  if (!props.stickToBottom || !containerRef.value) return

  isPinnedToBottom.value = isNearBottom(containerRef.value)
}

watch(
  () => props.stickToBottom,
  (enabled) => {
    isPinnedToBottom.value = enabled ? !containerRef.value || isNearBottom(containerRef.value) : false
  }
)

watch(
  () => [props.text, paragraphs.value.length, containerWidth.value, props.height],
  () => {
    if (!props.stickToBottom || !isPinnedToBottom.value) return
    nextTick(scrollToBottom)
  },
  { flush: 'post' }
)

const scrollToParagraph = (index: number) => {
  const safeIndex = Math.max(0, Math.min(index, paragraphs.value.length - 1))
  scrollTo(safeIndex)
}

defineExpose({
  paragraphs,
  isPinnedToBottom,
  scrollToParagraph,
  scrollToTop: () => scrollToParagraph(0),
  scrollToBottom
})
</script>

<template>
  <div
    ref="containerRef"
    v-scroll
    class="virtual-paragraph-text"
    :style="[
      containerProps.style,
      {
        height: viewportHeight,
        '--virtual-paragraph-font-size': `${fontSize}px`,
        '--virtual-paragraph-line-height': `${lineHeight}px`,
        '--virtual-paragraph-padding-block': `${paragraphPaddingBlock / 2}px`
      }
    ]"
    @scroll="handleScroll"
  >
    <slot v-if="paragraphs.length === 0" name="empty" />
    <div v-else class="virtual-paragraph-text__spacer" v-bind="wrapperProps">
      <article
        v-for="{ data: paragraph, index } in virtualParagraphs"
        :key="paragraph.id"
        class="virtual-paragraph-text__paragraph"
        :data-paragraph-index="index"
        :style="{ minHeight: `${Math.max(getParagraphHeight(index) - paragraphGap, minParagraphHeight)}px`, marginBottom: `${paragraphGap}px` }"
      >
        <slot name="paragraph" :paragraph="paragraph" :index="index">
          {{ paragraph.text }}
        </slot>
      </article>
    </div>
  </div>
</template>

<style scoped>
.virtual-paragraph-text {
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--text-primary);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.virtual-paragraph-text__spacer {
  width: 100%;
  min-height: 100%;
}

.virtual-paragraph-text__paragraph {
  box-sizing: border-box;
  width: 100%;
  padding-block: var(--virtual-paragraph-padding-block);
  font-size: var(--virtual-paragraph-font-size);
  line-height: var(--virtual-paragraph-line-height);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>
