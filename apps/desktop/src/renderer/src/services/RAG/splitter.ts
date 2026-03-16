import { RecursiveCharacterTextSplitter, CharacterTextSplitter } from '@langchain/textsplitters'

function getTextSplitter({ type, chunkSize, chunkOverlap }: SplitOptions) {
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

export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function prepareChunks(text: string, options: SplitOptions): Promise<Splitter> {
  const contents = await splitTextByType(text, options)
  const chunks: Splitter = []

  for (let index = 0; index < contents.length; index++) {
    const content = contents[index]
    chunks.push({
      id: index,
      content,
      contentHash: await hashContent(content),
      embedding: []
    })
  }

  return chunks
}
