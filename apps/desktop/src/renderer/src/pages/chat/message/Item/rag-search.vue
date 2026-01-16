<script setup lang="ts">
const props = defineProps<{
  searching?: boolean
  searchDetails?: RagSearchDetail[]
}>()

const Search = useIcon('Search')
const { knowledgeBases } = storeToRefs(useKnowledgeStore())

// 打开文档
const openDocument = (knowledgeBaseId: string, documentId: string) => {
  const knowledgeBase = knowledgeBases.value.find((kb) => kb.id === knowledgeBaseId)
  if (!knowledgeBase) return

  const document = knowledgeBase.documents?.find((doc) => doc.id === documentId)
  if (!document) return

  window.api.shell.openPath(window.api.url.fileURLToPath(document.path))
}

// 按知识库分组搜索结果
const groupedResults = computed(() => {
  if (!props.searchDetails || props.searchDetails.length === 0) {
    return []
  }

  const groups: Record<
    string,
    {
      name: string
      id: string
      documents: Array<{ name: string; id: string }>
    }
  > = {}

  props.searchDetails.forEach((detail) => {
    const knowledgeBase = knowledgeBases.value.find((kb) => kb.id === detail.knowledgeBaseId)
    if (!knowledgeBase) return

    const document = knowledgeBase.documents?.find((doc) => doc.id === detail.documentId)
    if (!document) return

    if (!groups[detail.knowledgeBaseId]) {
      groups[detail.knowledgeBaseId] = {
        name: knowledgeBase.name,
        id: detail.knowledgeBaseId,
        documents: []
      }
    }

    // 检查文档是否已存在
    const existingDoc = groups[detail.knowledgeBaseId].documents.find(
      (doc) => doc.id === detail.documentId
    )
    if (!existingDoc) {
      groups[detail.knowledgeBaseId].documents.push({
        name: document.name,
        id: detail.documentId
      })
    }
  })

  return Object.values(groups)
})
</script>

<template>
  <div v-if="searching" class="rag-searching-container">
    <Search class="rag-search-icon" />
    <span class="rag-search-text">正在搜索知识库...</span>
  </div>
  <div v-if="groupedResults.length > 0 && !searching" class="rag-search-results-container">
    <div class="rag-search-content">
      <Search class="rag-search-icon" />
      <div class="rag-search-text">已找到 {{ groupedResults.length }} 条相关内容</div>
    </div>
    <div v-if="groupedResults.length > 0" class="rag-search-details">
      <div v-for="(group, index) in groupedResults" :key="index" class="rag-search-group">
        <span class="rag-search-kb-name">{{ group.name }}</span>
        <div class="rag-search-docs">
          <span v-for="(doc, docIndex) in group.documents" :key="docIndex" class="rag-search-doc-item"
            @click="openDocument(group.id, doc.id)">
            {{ doc.name }}
          </span>
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
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  box-shadow: 0 1px 2px rgba(var(--text-rgb), 0.03);
  transition: box-shadow 0.2s;
}

.rag-searching-container {
  display: flex;
  flex-direction: row !important;
  align-items: center;
}

.rag-searching-container:hover,
.rag-search-results-container:hover {
  box-shadow: 0 4px 6px rgba(var(--text-rgb), 0.04);
}

.rag-searching-container {
  animation: fadeIn 0.3s ease-in-out;
}

.rag-search-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.rag-searching-container .rag-search-icon {
  animation: spin 1s linear infinite;
}

.rag-search-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.rag-search-text {
  font-weight: 500;
}

.rag-search-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color-light);
}

.rag-search-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.rag-search-kb-name {
  color: var(--text-sub);
  font-weight: 600;
  white-space: nowrap;
}

.rag-search-docs {
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rag-search-doc-item {
  cursor: pointer;
  color: var(--accent-color);
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: all 0.2s;
}

.rag-search-doc-item:hover {
  text-decoration-color: var(--accent-color);
  background-color: var(--bg-active);
  border-radius: 2px;
  padding: 0 2px;
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
