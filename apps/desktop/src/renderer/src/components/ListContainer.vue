<template>
  <div class="ListContainer" :class="{ isMobile }">
    <slot />
  </div>
</template>
<script setup lang="ts"></script>
<style>
.ListContainer {
  width: 220px;
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid var(--border-color);
}

.ListContainer.isMobile {
  width: 100%;
}
</style>
