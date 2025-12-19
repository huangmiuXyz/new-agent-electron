export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())
  const embedding = async (
    doc: KnowledgeDocument,
    knowledge: KnowledgeBase,
    continueFlag: boolean = false,
    batchSize?: number
  ) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    if (!modelId || !providerId) {
      messageApi.warning('请选择嵌入模型')
      return
    }
    if (continueFlag) {
      if (doc.metadata?.modelId !== modelId || doc.metadata.providerId !== providerId) {
        messageApi.error('模型不一致，无法继续')
        return
      }
    }
    const { model, provider } = getModelById(providerId, modelId)!
    if (doc.status === 'processing' && doc.abortController) {
      doc.abortController?.abort?.()
    }

    doc.status = 'processing'
    if (!continueFlag) {
      doc.isSplitting = false
      doc.chunks = []
    }
    const abortController = new AbortController()
    doc.abortController = abortController
    const originalAbort = abortController.abort.bind(abortController)
    abortController.abort = () => {
      doc.status = 'aborted'
      originalAbort()
    }

    try {
      doc.metadata = {
        modelId: model.id,
        providerId: provider.id
      }
      let splitter: Splitter
      if (continueFlag && (!doc.chunks || doc.chunks.length === 0)) {
        // Try to load from SQLite for continuation
        const support = await checkSqliteSupport()
        if (support && support.sqlite) {
          try {
            doc.chunks = await window.api.sqlite.getChunksByDoc(doc.id)
          } catch (e) {
            console.error('Failed to load chunks from SQLite for continuation', e)
          }
        }
      }

      if ((!doc.isSplitting || !continueFlag) && !doc.chunks?.length) {
        const splitterResult = await rag.splitter(doc)
        splitter = splitterResult.map((e) => ({
          content: e,
          embedding: []
        }))
        doc.isSplitting = true
        doc.chunks = splitter
      } else {
        splitter = doc.chunks!
      }
      await rag.embedding(splitter, {
        kbId: knowledge.id,
        docId: doc.id,
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name,
        abortController,
        onProgress: (data?: any, current?: number, total?: number) => {
          if (current !== undefined && total !== undefined) {
            doc.currentChunk = current
          }
          if (data) {
            doc.chunks = data
          }
        },
        continueFlag,
        batchSize
      })
      doc.status = 'processed'
      doc.chunkCount = doc.chunks?.length
      const support = await checkSqliteSupport()
      if (support && support.sqlite) {
        doc.chunks = []
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        doc.status = 'aborted'
      } else {
        doc.status = 'error'
      }
    }
  }

  const search = async (query: string, knowledgeId: string) => {
    const knowledge = knowledgeBases.value.find((k) => k.id === knowledgeId)
    if (!knowledge) return []
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!

    let rerankOptions
    if (knowledge.rerankModel && knowledge.rerankModel.modelId) {
      const { modelId: rerankModelId, providerId: rerankProviderId } = knowledge.rerankModel
      const rerankModelInfo = getModelById(rerankProviderId, rerankModelId)
      if (rerankModelInfo) {
        rerankOptions = {
          apiKey: rerankModelInfo.provider.apiKey!,
          baseURL: rerankModelInfo.provider.baseUrl,
          name: rerankModelInfo.provider.name,
          providerType: rerankModelInfo.provider.providerType,
          model: rerankModelInfo.model.name
        }
      }
    }

    return await rag.retrieve(
      query,
      knowledge,
      {
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name
      },
      knowledge.retrieveConfig,
      rerankOptions
    )
  }

  return { embedding, search }
}
