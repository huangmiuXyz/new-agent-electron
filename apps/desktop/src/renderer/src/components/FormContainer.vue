<script setup lang="ts">
interface Props {
  showHeader?: boolean
  headerTitle?: string
  noPadding?: boolean
}

withDefaults(defineProps<Props>(), {
  showHeader: true,
  headerTitle: '',
  noPadding: false
})
</script>

<template>
  <div class="setting-form-container">
    <!-- 内容插槽 -->
    <div class="setting-content" :class="{ 'no-padding': noPadding }">
      <slot name="content"></slot>
    </div>
  </div>
</template>

<style scoped>
.setting-form-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.settings-header {
  height: var(--header-h);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 24px;
  font-weight: 600;
  font-size: 14px;
}

.setting-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 12px;
}

.setting-content.no-padding {
  padding: 0;
}
</style>
