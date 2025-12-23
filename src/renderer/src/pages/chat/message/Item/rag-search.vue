<script setup lang="ts">
const props = defineProps<{
  searching?: boolean
  resultCount?: number
  searchDetails?: RagSearchDetail[]
}>()

const Search = useIcon('Search')

// 按知识库分组搜索结果
const groupedResults = computed(() => {
  if (!props.searchDetails || props.searchDetails.length === 0) {
    return []
  }
  
  const groups: Record<string, { name: string; documents: Set<string> }> = {}
  
  props.searchDetails.forEach((detail) => {
    // 过滤掉文档名称为 "Unknown" 的结果
    if (detail.documentName === 'Unknown') {
      return
    }
    
    if (!groups[detail.knowledgeBaseName]) {
      groups[detail.knowledgeBaseName] = {
        name: detail.knowledgeBaseName,
        documents: new Set()
      }
    }
    groups[detail.knowledgeBaseName].documents.add(detail.documentName)
  })
  
  return Object.values(groups).map((group) => ({
    name: group.name,
    documents: Array.from(group.documents)
  }))
})
</script>

<template>
  <div v-if="searching" class="rag-searching-container">
    <Search class="rag-search-icon" />
    <span class="rag-search-text">正在搜索知识库...</span>
  </div>
  <div v-if="resultCount !== undefined && !searching" class="rag-search-results-container">
    <Search class="rag-search-icon" />
    <div class="rag-search-content">
      <span class="rag-search-text">已找到 {{ resultCount }} 条相关内容</span>
      <div v-if="groupedResults.length > 0" class="rag-search-details">
        <div v-for="(group, index) in groupedResults" :key="index" class="rag-search-group">
          <span class="rag-search-kb-name">{{ group.name }}</span>
          <span class="rag-search-docs">{{ group.documents.join(', ') }}</span>
        </div>
      </div>
    </div>
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

.rag-search-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rag-search-text {
  font-weight: 500;
}

.rag-search-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #e5e7eb;
}

.rag-search-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.rag-search-kb-name {
  color: #4b5563;
  font-weight: 600;
  white-space: nowrap;
}

.rag-search-docs {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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