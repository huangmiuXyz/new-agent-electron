export const useKnowledge = () => {
  const rag = RAGService()
  const embedding = (doc: KnowledgeDocument) => {
    rag.embedding(doc)
  }
  return { embedding }
}
