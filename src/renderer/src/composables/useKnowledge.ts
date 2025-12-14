export const useKnowledge = () => {
  const rag = RAGService()
  const embedding = (doc: KnowledgeDocument) => {
    return rag.embedding(doc)
  }
  return { embedding }
}
