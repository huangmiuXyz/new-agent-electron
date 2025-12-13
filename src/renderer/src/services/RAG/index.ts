import { splitTextByType } from './splitter'
export const RAGService = () => {
  const embedding = (doc: KnowledgeDocument) => {
    const result = splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
      type: doc.type
    })
    console.log(result)
  }
  return { embedding }
}
