<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

defineOptions({ name: 'StatusPanel' })

const props = defineProps<{
  title?: string
  triggerEl: HTMLElement
}>()

const emit = defineEmits<{
  close: []
}>()

const panelStyle = ref({
  left: 'auto' as string,
  right: 'auto' as string,
  bottom: 'auto' as string,
  triangleLeft: 'auto' as string,
  triangleRight: 'auto' as string,
})

const updatePosition = () => {
  const rect = props.triggerEl.getBoundingClientRect()
  const spaceRight = window.innerWidth - rect.right
  const spaceLeft = rect.left
  const panelW = 320
  const triOff = rect.width / 2 + 2
  const bottomPos = window.innerHeight - rect.top + 4 + 'px'

  if (spaceRight >= panelW || spaceRight >= spaceLeft) {
    panelStyle.value = {
      left: Math.max(4, rect.left) + 'px',
      right: 'auto',
      bottom: bottomPos,
      triangleLeft: triOff + 'px',
      triangleRight: 'auto',
    }
  } else {
    panelStyle.value = {
      left: 'auto',
      right: Math.max(4, spaceRight) + 'px',
      bottom: bottomPos,
      triangleLeft: 'auto',
      triangleRight: triOff + 'px',
    }
  }
}

const closePanel = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null
  if (!target) return
  if (
    target.closest('.status-panel-wrap') ||
    target === props.triggerEl ||
    props.triggerEl.contains(target)
  ) return
  emit('close')
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

const animStyleId = 'lsp-popover-keyframes'

onMounted(async () => {
  await nextTick()
  updatePosition()
  window.addEventListener('pointerdown', closePanel, true)
  document.addEventListener('keydown', onKeydown)
  if (!document.getElementById(animStyleId)) {
    const s = document.createElement('style')
    s.id = animStyleId
    s.textContent = '@keyframes lsp-popover-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}'
    document.head.appendChild(s)
  }
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', closePanel, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="status-panel-wrap"
    :style="{
      position: 'fixed',
      left: panelStyle.left,
      right: panelStyle.right,
      bottom: panelStyle.bottom,
      zIndex: 9999,
      animation: 'lsp-popover-in 0.15s ease-out',
    }"
  >
    <div
      :style="{
        width: '320px',
        maxHeight: '360px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }"
    >
      <div
        v-if="title"
        :style="{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-color-light)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }"
      >
        {{ title }}
      </div>
      <div
        :style="{
          flex: 1,
          overflowY: 'auto',
        }"
      >
        <slot />
      </div>
    </div>
    <div
      :style="{
        position: 'absolute',
        bottom: '-7px',
        left: panelStyle.triangleLeft,
        right: panelStyle.triangleRight,
        width: 0,
        height: 0,
        marginLeft: panelStyle.triangleLeft !== 'auto' ? '-8px' : undefined,
        marginRight: panelStyle.triangleRight !== 'auto' ? '-8px' : undefined,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid var(--bg-card)',
      }"
    />
  </div>
</template>
