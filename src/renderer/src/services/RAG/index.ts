import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embedMany } from 'ai'
export const RAGService = () => {
  const embedding = async (
    doc: KnowledgeDocument,
    options: {
      apiKey: string
      baseURL: string
      name: string
      model: string
    }
  ) => {
    const result = await splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
      type: doc.type
    })
    const { embeddings } = await embedMany({
      model: createRegistry(options).embeddingModel(options.model),
      values: result
    })
    console.log(embeddings)
  }
  return { embedding }
}
