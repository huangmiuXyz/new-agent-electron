export const useKnowledge = () => {
  const rag = RAGService()
  const embedding = (doc: KnowledgeDocument) => {}
  return { embedding }
}
