<template>
  <div class="global-chat-panel">
    <ChatMain compact />
  </div>
</template>

<style scoped>
.global-chat-panel {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-main-surface);
}
</style>
