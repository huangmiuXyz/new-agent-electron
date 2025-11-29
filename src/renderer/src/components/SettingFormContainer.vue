<script setup lang="ts">
interface Props {
  showHeader?: boolean
  headerTitle?: string
}

withDefaults(defineProps<Props>(), {
  showHeader: true,
  headerTitle: ''
})
</script>

<template>
  <div class="setting-form-container">
    <!-- 可配置的头部插槽 -->
    <header v-if="showHeader" class="settings-header drag">
      <slot name="header">
        {{ headerTitle }}
      </slot>
    </header>

    <!-- 内容插槽 -->
    <div class="setting-content">
      <slot name="content"></slot>
    </div>
  </div>
</template>

<style scoped>
.setting-form-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
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
  overflow-y: auto;
  padding: 20px 20px;
}
</style>
