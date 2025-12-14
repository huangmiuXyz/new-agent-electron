export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())
  const embedding = async (doc: KnowledgeDocument, knowledge: KnowledgeBase) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!
    doc.status = 'processing'
    try {
      const chunks = await rag.embedding(doc, {
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name
      })
      doc.status = 'processed'
      doc.chunks = chunks
    } catch {
      doc.status = 'error'
    }
  }

  const search = async (query: string, knowledgeId: string) => {
    const knowledge = knowledgeBases.value.find((k) => k.id === knowledgeId)
    if (!knowledge) return []
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!

    return await rag.retrieve(query, knowledge, {
      apiKey: provider.apiKey!,
      baseURL: provider.baseUrl,
      name: provider.name,
      providerType: provider.providerType,
      model: model.name
    })
  }

  return { embedding, search }
}
