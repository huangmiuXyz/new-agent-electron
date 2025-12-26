<template>
  <div class="SettingsListContainer" :class="{ isMobile }">
    <slot />
  </div>
</template>
<script setup lang="ts"></script>
<style>
.SettingsListContainer {
  width: 260px;
  padding: 12px;
  border-right: 1px solid var(--border-color);
}

.SettingsListContainer.isMobile {
  width: 100%;
}
</style>
