import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embedMany } from 'ai'
export const RAGService = () => {
  const embedding = async (
    doc: KnowledgeDocument,
    options: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
    }
  ) => {
    const result = await splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
      type: doc.type
    })
    const { embeddings } = await embedMany({
      model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
      values: result
    })
    console.log(embeddings)
  }
  return { embedding }
}
