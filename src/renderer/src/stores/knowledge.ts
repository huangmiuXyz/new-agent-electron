import { defineStore } from 'pinia'

export const useKnowledgeStore = defineStore(
  'knowledge',
  () => {
    // 知识库设置
    const knowledgeBases = ref<KnowledgeBase[]>([
      {
        id: 'default-local',
        name: '本地知识库',
        description: '本地文件系统中的知识库',
        type: 'local',
        path: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200,
        active: true,
        created: +new Date(),
        documents: []
      },
      {
        id: 'default-remote',
        name: '远程知识库',
        description: '远程API访问的知识库',
        type: 'remote',
        url: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200,
        active: false,
        created: +new Date(),
        documents: []
      }
    ])

    // 知识库相关方法
    const updateKnowledgeBase = (knowledgeBaseId: string, knowledgeBaseData: KnowledgeBase) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const currentKnowledgeBase = knowledgeBases.value[index]
        if (currentKnowledgeBase) {
          knowledgeBases.value[index] = {
            ...knowledgeBaseData,
            id: currentKnowledgeBase.id,
            created: currentKnowledgeBase.created
          }
        }
      }
    }

    const addKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
      knowledgeBases.value.push(knowledgeBase)
    }

    const deleteKnowledgeBase = (knowledgeBaseId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        knowledgeBases.value.splice(index, 1)
      }
    }

    const addDocumentToKnowledgeBase = (knowledgeBaseId: string, document: KnowledgeDocument) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase) {
          if (!knowledgeBase.documents) {
            knowledgeBase.documents = []
          }
          knowledgeBase.documents.push(document)
        }
      }
    }

    const deleteDocumentFromKnowledgeBase = (knowledgeBaseId: string, documentId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase && knowledgeBase.documents) {
          const docIndex = knowledgeBase.documents.findIndex((doc) => doc.id === documentId)
          if (docIndex !== -1) {
            knowledgeBase.documents.splice(docIndex, 1)
          }
        }
      }
    }

    const getKnowledgeBaseById = (id: string) => {
      return knowledgeBases.value.find((kb) => kb.id === id)
    }

    return {
      knowledgeBases,
      updateKnowledgeBase,
      addKnowledgeBase,
      deleteKnowledgeBase,
      addDocumentToKnowledgeBase,
      deleteDocumentFromKnowledgeBase,
      getKnowledgeBaseById
    }
  },
  {
    persist: true
  }
)
