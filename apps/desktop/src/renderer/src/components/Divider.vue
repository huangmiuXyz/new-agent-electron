<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  margin?: string | number
  vertical?: boolean
  dashed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  margin: '0',
  vertical: false,
  dashed: false
})

const dividerStyle = computed(() => {
  const style: any = {}
  if (props.margin) {
    style.margin = typeof props.margin === 'number' ? `${props.margin}px` : props.margin
  }
  return style
})
</script>

<template>
  <div
    class="divider"
    :class="{ 'divider--vertical': vertical, 'divider--dashed': dashed }"
    :style="dividerStyle"
  ></div>
</template>

<style scoped>
.divider {
  width: 100%;
  height: 1px;
  background-color: var(--border-subtle);
  flex-shrink: 0;
}

.divider--vertical {
  width: 1px;
  height: 1em;
  display: inline-block;
  margin: 0 8px;
  vertical-align: middle;
}

.divider--dashed {
  background: none;
  border-top: 1px dashed var(--border-subtle);
}

.divider--vertical.divider--dashed {
  border-top: none;
  border-left: 1px dashed var(--border-subtle);
}
</style>
