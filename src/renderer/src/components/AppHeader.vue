<script setup lang="ts">
import { ref } from 'vue'
import GlobalSearch from '@renderer/components/GlobalSearch.vue'

const Search = useIcon('Search')
const showSearch = ref(false)

const openSearch = () => {
  showSearch.value = true
}

</script>

<template>
  <header class="app-header drag">
    <div class="header-info">
    </div>
    <div class="header-actions">
      <Button variant="text" size="lg" @click="openSearch">
        <Search />
      </Button>
    </div>

    <!-- 全局搜索组件 -->
    <GlobalSearch v-model="showSearch" />
  </header>
</template>

<style scoped>
/* 头部：磨砂玻璃效果，极简边框 */
.app-header {
  height: var(--header-h);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.header-status {
  font-size: 11px;
  color: var(--text-secondary);
  padding-left: 8px;
  border-left: 1px solid var(--border-subtle);
}

.header-actions {
  display: flex;
  gap: 8px;
  color: var(--text-secondary);
}

.header-actions i {
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;
}

.header-actions i:hover {
  color: var(--text-primary);
}
</style>
