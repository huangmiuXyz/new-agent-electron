export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const embedding = async (doc: KnowledgeDocument, knowledge: KnowledgeBase) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!
    const embeddings = await rag.embedding(doc, {
      apiKey: provider.apiKey!,
      baseURL: provider.baseUrl,
      name: provider.name,
      providerType: provider.providerType,
      model: model.name
    })
    doc.embedding = embeddings
  }
  return { embedding }
}
