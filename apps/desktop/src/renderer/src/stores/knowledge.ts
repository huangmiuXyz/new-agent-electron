let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

const serializeKnowledgeState = (state: any) => {
  return JSON.stringify({
    ...state,
    knowledgeBases: state.knowledgeBases.map((knowledgeBase) => ({
      ...knowledgeBase,
      documents: (knowledgeBase.documents || []).map((doc) => ({
        ...doc,
        abortController: null,
        chunks: (doc.chunks || []).map((chunk) => ({
          ...chunk,
          embedding: []
        }))
      }))
    }))
  })
}

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
    const isAfterRestore = restorePromise

    watch(
      () => activeKnowledgeBaseId.value,
      (v) => {
        if (!v) {
          activeKnowledgeBaseId.value = knowledgeBases.value[0].id
        }
      }
    )

    const abortDocumentProcessing = (doc: KnowledgeDocument) => {
      doc.cancelRequested = true
      doc.status = 'aborted'
      doc.abortController?.abort?.()
    }

    const abortKnowledgeBaseDocuments = (knowledgeBase?: KnowledgeBase) => {
      for (const doc of knowledgeBase?.documents || []) {
        abortDocumentProcessing(doc)
      }
    }

    const updateKnowledgeBase = (knowledgeBaseId: string, knowledgeBaseData: KnowledgeBase) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const currentKnowledgeBase = knowledgeBases.value[index]
        if (currentKnowledgeBase) {
          const embeddingConfigChanged =
            currentKnowledgeBase.embeddingModel.modelId !== knowledgeBaseData.embeddingModel.modelId ||
            currentKnowledgeBase.embeddingModel.providerId !== knowledgeBaseData.embeddingModel.providerId ||
            currentKnowledgeBase.embeddingConfig?.chunkSize !== knowledgeBaseData.embeddingConfig?.chunkSize ||
            currentKnowledgeBase.embeddingConfig?.chunkOverlap !== knowledgeBaseData.embeddingConfig?.chunkOverlap

          if (embeddingConfigChanged) {
            abortKnowledgeBaseDocuments(currentKnowledgeBase)
          }

          const resetDocuments = embeddingConfigChanged
            ? (currentKnowledgeBase.documents || []).map((doc) => ({
              ...doc,
              status: 'processing' as const,
              chunks: [],
              abortController: null,
              currentChunk: 0,
              isSplitting: false,
              metadata: {
                ...doc.metadata,
                modelId: knowledgeBaseData.embeddingModel.modelId,
                providerId: knowledgeBaseData.embeddingModel.providerId,
                chunkSize: knowledgeBaseData.embeddingConfig?.chunkSize,
                chunkOverlap: knowledgeBaseData.embeddingConfig?.chunkOverlap
              }
            }))
            : currentKnowledgeBase.documents

          knowledgeBases.value[index] = {
            ...knowledgeBaseData,
            id: currentKnowledgeBase.id,
            created: currentKnowledgeBase.created,
            documents: resetDocuments
          }

          if (embeddingConfigChanged) {
            void window.api.sqlite.deleteChunksByKb(knowledgeBaseId)
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
        abortKnowledgeBaseDocuments(knowledgeBases.value[index])
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
          knowledgeBase.documents
            .filter((doc) => idsSet.has(doc.id))
            .forEach((doc) => {
              abortDocumentProcessing(doc)
            })
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
      modelId?: string
    ) => {
      const sqliteChunks = chunks.map((c) => ({
        id: `${docId}-${c.id}`,
        doc_id: docId,
        kb_id: kbId,
        model_id: modelId || '',
        content_hash: c.contentHash || '',
        content: c.content,
        embedding: Array.from(c.embedding)
      }))
      await window.api.sqlite.upsertChunks(sqliteChunks)
    }

    const reconcileDocumentsAfterRestore = async () => {
      for (const knowledgeBase of knowledgeBases.value) {
        for (const doc of knowledgeBase.documents || []) {
          doc.abortController = null
        }
      }

      const sqliteSupported = await window.api.sqlite.isSupported().catch(() => false)
      if (!sqliteSupported) {
        for (const knowledgeBase of knowledgeBases.value) {
          for (const doc of knowledgeBase.documents || []) {
            if (doc.status === 'processing') {
              doc.status = 'aborted'
            }
          }
        }
        return
      }

      const docIds = knowledgeBases.value.flatMap((kb) => (kb.documents || []).map((doc) => doc.id))
      if (!docIds.length) return

      const counts: { doc_id: string; count: number }[] = await window.api.sqlite
        .getChunkCountsByDoc({ doc_ids: docIds })
        .catch(() => [])
      const countMap = new Map<string, number>(
        counts.map((item) => [item.doc_id, item.count] as const)
      )

      for (const knowledgeBase of knowledgeBases.value) {
        for (const doc of knowledgeBase.documents || []) {
          const totalChunks = doc.chunks?.length || 0
          const processedChunks = countMap.get(doc.id) || 0

          if (totalChunks > 0) {
            doc.currentChunk = Math.min(processedChunks, totalChunks)
            doc.isSplitting = true
            if (processedChunks >= totalChunks) {
              doc.status = 'processed'
            } else if (processedChunks > 0 || doc.status === 'processing') {
              doc.status = 'aborted'
            }
          } else if (doc.status === 'processing') {
            doc.status = 'aborted'
          }
        }
      }
    }

    return {
      knowledgeBases,
      isAfterRestore,
      updateKnowledgeBase,
      addKnowledgeBase,
      deleteKnowledgeBase,
      addDocumentToKnowledgeBase,
      addDocumentsToKnowledgeBase,
      deleteDocumentsFromKnowledgeBase,
      upsertChunksToSqlite,
      reconcileDocumentsAfterRestore
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      serializer: {
        serialize: serializeKnowledgeState,
        deserialize: JSON.parse
      },
      afterRestore: (ctx?: { store?: unknown }) => {
        Promise.resolve((ctx?.store as any)?.reconcileDocumentsAfterRestore?.())
          .catch((error) => {
            console.error('Failed to reconcile knowledge documents after restore:', error)
          })
          .finally(() => {
            resolveRestore()
          })
      }
    }
  }
)
