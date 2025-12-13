import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from '@langchain/textsplitters'

type SplitType = 'text/markdown' | 'text' | 'code' | 'log'

interface SplitOptions {
  type: SplitType
  chunkSize?: number
  chunkOverlap?: number
}

function getTextSplitter({ type, chunkSize = 800, chunkOverlap = 100 }: SplitOptions) {
  switch (type) {
    case 'text/markdown':
      return new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', ' ', '']
      })

    case 'text':
      return new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '。', '！', '？', ';', ' ', '']
      })

    case 'code':
      return new CharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separator: '\n'
      })

    case 'log':
      return new CharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separator: '\n'
      })

    default:
      throw new Error(`Unsupported split type: ${type}`)
  }
}

export async function splitTextByType(text: string, options: SplitOptions) {
  const splitter = getTextSplitter(options)
  const docs = await splitter.createDocuments([text])

  return docs.map((doc, index) => ({
    id: index,
    content: doc.pageContent,
    metadata: {
      type: options.type,
      chunk: index
    }
  }))
}
