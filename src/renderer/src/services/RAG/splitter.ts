import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from '@langchain/textsplitters'

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
      // Default to text splitter for unknown types
      return new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', ' ', '']
      })
  }
}

export async function splitTextByType(text: string, options: SplitOptions) {
  const splitter = getTextSplitter(options)
  const docs = await splitter.createDocuments([text])

  return docs.map((doc) => doc.pageContent)
}
