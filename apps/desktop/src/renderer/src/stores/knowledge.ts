export const useKnowledgeStore = defineStore(
  'knowledge',
  () => {

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

          knowledgeBase.documents = [...knowledgeBase.documents, document]
        }
      }
    }
    const addDocumentsToKnowledgeBase = (knowledgeBaseId: string, documents: KnowledgeDocument[]) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase) {
          if (!knowledgeBase.documents) {
            knowledgeBase.documents = []
          }
          documents.forEach((doc) => {
            knowledgeBase.documents!.push(doc)
          })
        }
      }
    }

    const deleteDocumentsFromKnowledgeBase = (knowledgeBaseId: string, documentIds: string[]) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase && knowledgeBase.documents) {
          const idsSet = new Set(documentIds)
          knowledgeBase.documents = knowledgeBase.documents.filter((doc) => !idsSet.has(doc.id))
          documentIds.forEach((documentId) => {
            window.api.sqlite.deleteChunksByDoc(documentId)
          })
        }
      }
    }

    const upsertChunksToSqlite = async (
      kbId: string,
      docId: string,
      chunks: Splitter,
      modelId?: string,
      contentHashes?: string[]
    ) => {
      const sqliteChunks = chunks.map((c, i) => ({
        id: `${docId}-${c.id}`,
        doc_id: docId,
        kb_id: kbId,
        model_id: modelId || '',
        content_hash: contentHashes?.[i] || '',
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
      addDocumentsToKnowledgeBase,
      deleteDocumentsFromKnowledgeBase,
      upsertChunksToSqlite
    }
  },
  {
    persist: {
      storage: indexedDBStorage
    }
  }
)
