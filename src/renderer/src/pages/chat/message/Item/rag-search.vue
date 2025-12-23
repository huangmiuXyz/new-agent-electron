<script setup lang="ts">
const props = defineProps<{
  searching?: boolean
  resultCount?: number
}>()

const Search = useIcon('Search')
</script>

<template>
  <div v-if="searching" class="rag-searching-container">
    <Search class="rag-search-icon" />
    <span class="rag-search-text">正在搜索知识库...</span>
  </div>
  <div v-if="resultCount !== undefined && !searching" class="rag-search-results-container">
    <Search class="rag-search-icon" />
    <span class="rag-search-text">已找到 {{ resultCount }} 条相关内容</span>
  </div>
</template>

<style scoped>
/* RAG search status styles */
.rag-searching-container,
.rag-search-results-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  color: #6b7280;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.2s;
}

.rag-searching-container:hover,
.rag-search-results-container:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);
}

.rag-searching-container {
  animation: fadeIn 0.3s ease-in-out;
}

.rag-search-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #6b7280;
}

.rag-searching-container .rag-search-icon {
  animation: spin 1s linear infinite;
}

.rag-search-text {
  flex: 1;
  font-weight: 500;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>