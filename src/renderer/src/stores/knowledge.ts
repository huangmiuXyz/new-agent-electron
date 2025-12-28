export const useKnowledgeStore = defineStore(
  'knowledge',
  () => {
    // 知识库设置
    const knowledgeBases = ref<KnowledgeBase[]>([
      {
        id: 'default-local',
        name: '默认知识库',
        description: '',
        embeddingModel: {
          modelId: '',
          providerId: ''
        },
        active: true,
        created: +new Date(),
        documents: []
      }
    ])

    const activeKnowledgeBaseId = useLocalStorage<string>('activeKnowledgeBaseId', '')

    watch(
      () => activeKnowledgeBaseId.value,
      (v) => {
        if (!v) {
          activeKnowledgeBaseId.value = knowledgeBases.value[0].id
        }
      }
    )
    // 知识库相关方法
    const updateKnowledgeBase = (knowledgeBaseId: string, knowledgeBaseData: KnowledgeBase) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const currentKnowledgeBase = knowledgeBases.value[index]
        if (currentKnowledgeBase) {
          knowledgeBases.value[index] = {
            ...knowledgeBaseData,
            id: currentKnowledgeBase.id,
            created: currentKnowledgeBase.created
          }
        }
      }
    }

    const addKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
      knowledgeBases.value.push(knowledgeBase)
    }

    const deleteKnowledgeBase = (knowledgeBaseId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        knowledgeBases.value.splice(index, 1)
        window.api.sqlite.deleteChunksByKb(knowledgeBaseId)
      }
    }

    const addDocumentToKnowledgeBase = (knowledgeBaseId: string, document: KnowledgeDocument) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase) {
          if (!knowledgeBase.documents) {
            knowledgeBase.documents = []
          }
          // 创建新数组以触发响应式更新
          knowledgeBase.documents = [...knowledgeBase.documents, document]
        }
      }
    }

    const deleteDocumentFromKnowledgeBase = (knowledgeBaseId: string, documentId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase && knowledgeBase.documents) {
          const docIndex = knowledgeBase.documents.findIndex((doc) => doc.id === documentId)
          if (docIndex !== -1) {
            knowledgeBase.documents.splice(docIndex, 1)
            window.api.sqlite.deleteChunksByDoc(documentId)
          }
        }
      }
    }

    const upsertChunksToSqlite = async (kbId: string, docId: string, chunks: Splitter) => {
      const sqliteChunks = chunks.map((c) => ({
        id: `${docId}-${c.id}`,
        doc_id: docId,
        kb_id: kbId,
        content: c.content,
        embedding: Array.from(c.embedding)
      }))
      await window.api.sqlite.upsertChunks(sqliteChunks)
    }

    return {
      knowledgeBases,
      updateKnowledgeBase,
      addKnowledgeBase,
      deleteKnowledgeBase,
      addDocumentToKnowledgeBase,
      deleteDocumentFromKnowledgeBase,
      upsertChunksToSqlite
    }
  },
  {
    persist: {
      storage: indexedDBStorage
    }
  }
)
