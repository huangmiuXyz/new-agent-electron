<template>
  <div class="ListContainer" :class="{ isMobile }">
    <slot />
  </div>
</template>
<script setup lang="ts"></script>
<style>
.ListContainer {
  width: 220px;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  padding: 12px;
  padding-top: 8px;
}

.ListContainer.isMobile {
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  border-right: none;
}
</style>
