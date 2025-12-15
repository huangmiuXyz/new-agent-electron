export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())
  const embedding = async (
    doc: KnowledgeDocument,
    knowledge: KnowledgeBase,
    continueFlag: boolean = false
  ) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
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
      doc.progress = 0
    }
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
      if ((!doc.isSplitting || !continueFlag) && !doc.chunks?.length) {
        const splitterResult = await rag.splitter(doc)
        splitter = splitterResult.map((e) => ({
          content: e,
          embedding: []
        }))
        doc.isSplitting = true
      } else {
        splitter = doc.chunks!
      }
      await rag.embedding(splitter, {
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name,
        abortController,
        onProgress: (progress: number, data?: any) => {
          doc.progress = progress
          if (data) {
            doc.chunks = data
          }
        },
        continueFlag
      })
      doc.status = 'processed'
      doc.progress = 100
    } catch (error) {
      if (abortController.signal.aborted) {
        doc.status = 'aborted'
      } else {
        doc.status = 'error'
      }
      doc.progress = undefined
    }
  }

  const search = async (query: string, knowledgeId: string) => {
    const knowledge = knowledgeBases.value.find((k) => k.id === knowledgeId)
    if (!knowledge) return []
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!

    // Prepare rerank options if configured
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
