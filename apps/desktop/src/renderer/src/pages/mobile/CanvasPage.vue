<script setup lang="ts">
const { customTitle } = useAppHeader()
</script>

<template>
  <div class="mobile-canvas-page">
    <AppHeader :custom-title="customTitle" current-view="chat" mode="detail" />
    <div class="canvas-page-content">
      <ChatCanvasPanel hide-git-tab hide-local-folder-actions />
    </div>
  </div>
</template>

<style scoped>
.mobile-canvas-page {
  width: 100%;
  height: var(--vh, 100dvh);
  overflow: hidden;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
}

.canvas-page-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.canvas-page-content :deep(.canvas-panel) {
  height: 100%;
  border-left: none;
}
</style>
