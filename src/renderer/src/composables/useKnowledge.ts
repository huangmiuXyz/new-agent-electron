export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const embedding = (doc: KnowledgeDocument, knowledge: KnowledgeBase) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!
    return rag.embedding(doc, {
      apiKey: provider.apiKey!,
      baseURL: provider.baseUrl,
      name: provider.name,
      model: model.name
    })
  }
  return { embedding }
}
