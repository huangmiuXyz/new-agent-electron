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

    const init = async () => {
      const kbs = await window.api.sqlite.getKnowledgeBases()
      if (kbs.length > 0) {
        for (const kb of kbs) {
          kb.documents = await window.api.sqlite.getDocuments(kb.id)
        }
        knowledgeBases.value = kbs
      } else {
        // Save initial default KB to SQLite
        const { documents, ...serializableKb } = JSON.parse(JSON.stringify(knowledgeBases.value[0]))
        await window.api.sqlite.upsertKnowledgeBase(serializableKb)
      }
    }

    watch(
      () => activeKnowledgeBaseId.value,
      (v) => {
        if (!v && knowledgeBases.value.length > 0) {
          activeKnowledgeBaseId.value = knowledgeBases.value[0].id
        }
      }
    )

    const updateKnowledgeBase = async (knowledgeBaseId: string, knowledgeBaseData: KnowledgeBase) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const currentKnowledgeBase = knowledgeBases.value[index]
        if (currentKnowledgeBase) {
          const updatedKb = {
            ...knowledgeBaseData,
            id: currentKnowledgeBase.id,
            created: currentKnowledgeBase.created
          }
          knowledgeBases.value[index] = updatedKb
          const { documents, ...serializableKb } = JSON.parse(JSON.stringify(updatedKb))
          await window.api.sqlite.upsertKnowledgeBase(serializableKb)
        }
      }
    }

    const addKnowledgeBase = async (knowledgeBase: KnowledgeBase) => {
      knowledgeBases.value.push(knowledgeBase)
      const { documents, ...serializableKb } = JSON.parse(JSON.stringify(knowledgeBase))
      await window.api.sqlite.upsertKnowledgeBase(serializableKb)
    }

    const deleteKnowledgeBase = async (knowledgeBaseId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        knowledgeBases.value.splice(index, 1)
        await window.api.sqlite.deleteKnowledgeBase(knowledgeBaseId)
      }
    }

    const addDocumentToKnowledgeBase = async (knowledgeBaseId: string, document: KnowledgeDocument) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase) {
          if (!knowledgeBase.documents) {
            knowledgeBase.documents = []
          }

          knowledgeBase.documents = [...knowledgeBase.documents, document]
          const { abortController, chunks, ...serializableDoc } = JSON.parse(
            JSON.stringify(document)
          )
          await window.api.sqlite.upsertDocument({ ...serializableDoc, kb_id: knowledgeBaseId })
        }
      }
    }

    const updateDocumentStatus = async (
      knowledgeBaseId: string,
      documentId: string,
      status: KnowledgeDocumentStatus,
      metadata?: any,
      currentChunk?: number,
      isSplitting?: boolean
    ) => {
      const kb = knowledgeBases.value.find((kb) => kb.id === knowledgeBaseId)
      if (kb && kb.documents) {
        const doc = kb.documents.find((d) => d.id === documentId)
        if (doc) {
          doc.status = status
          if (metadata) {
            doc.metadata = { ...doc.metadata, ...metadata }
          }
          if (currentChunk !== undefined) {
            doc.currentChunk = currentChunk
          }
          if (isSplitting !== undefined) {
            doc.isSplitting = isSplitting
          }
          const { abortController, chunks, ...serializableDoc } = JSON.parse(JSON.stringify(doc))
          await window.api.sqlite.upsertDocument({ ...serializableDoc, kb_id: knowledgeBaseId })
        }
      }
    }

    const deleteDocumentFromKnowledgeBase = async (knowledgeBaseId: string, documentId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase && knowledgeBase.documents) {
          const docIndex = knowledgeBase.documents.findIndex((doc) => doc.id === documentId)
          if (docIndex !== -1) {
            knowledgeBase.documents.splice(docIndex, 1)
            await window.api.sqlite.deleteDocument(documentId)
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
        embedding: Array.from(c.embedding),
        content_hash: c.content_hash
      }))
      await window.api.sqlite.upsertChunks(sqliteChunks)
    }

    return {
      knowledgeBases,
      init,
      updateKnowledgeBase,
      addKnowledgeBase,
      deleteKnowledgeBase,
      addDocumentToKnowledgeBase,
      updateDocumentStatus,
      deleteDocumentFromKnowledgeBase,
      upsertChunksToSqlite
    }
  }
)
