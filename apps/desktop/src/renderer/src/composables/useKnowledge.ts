export const useKnowledge = () => {
  const rag = RAGService()
  const { getModelById } = useSettingsStore()
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())
  const { upsertChunksToSqlite, updateDocumentStatus } = useKnowledgeStore()
  const embedding = async (
    doc: KnowledgeDocument,
    knowledge: KnowledgeBase,
    continueFlag: boolean = false,
    batchSize?: number,
    providerOptions?: embedProviderOptions
  ) => {
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    if (!modelId || !providerId) {
      messageApi.warning('请选择嵌入模型')
      return
    }
    const { model, provider } = getModelById(providerId, modelId)!
    if (continueFlag) {
      if (doc.metadata?.modelId !== modelId || doc.metadata.providerId !== providerId) {
        messageApi.error('模型不一致，无法继续')
        return
      }
      if (
        doc.metadata?.chunkSize !== knowledge.embeddingConfig?.chunkSize ||
        doc.metadata?.chunkOverlap !== knowledge.embeddingConfig?.chunkOverlap
      ) {
        messageApi.error('分块配置不一致，无法继续')
        return
      }
    } else {
      doc.metadata = {
        ...doc.metadata,
        modelId: model.id,
        providerId: provider.id,
        chunkSize: knowledge.embeddingConfig?.chunkSize,
        chunkOverlap: knowledge.embeddingConfig?.chunkOverlap
      }
    }
    if (doc.status === 'processing' && doc.abortController) {
      doc.abortController?.abort?.()
    }

    doc.status = 'processing'
    await updateDocumentStatus(knowledge.id, doc.id, 'processing', doc.metadata)

    if (!continueFlag) {
      doc.isSplitting = false
      doc.chunks = []
      doc.currentChunk = 0
      await window.api.sqlite.deleteChunksByDoc(doc.id)
      await updateDocumentStatus(knowledge.id, doc.id, 'processing', doc.metadata, 0, false)
    }

    const abortController = new AbortController()
    doc.abortController = abortController
    const originalAbort = abortController.abort.bind(abortController)
    abortController.abort = async () => {
      doc.status = 'aborted'
      await updateDocumentStatus(
        knowledge.id,
        doc.id,
        'aborted',
        undefined,
        doc.currentChunk,
        doc.isSplitting
      )
      originalAbort()
      doc.abortController = null
    }

    try {
      let splitter: Splitter
      if ((!doc.isSplitting || !continueFlag) && !doc.chunks?.length) {
        splitter = await rag.splitter(doc, {
          type: getSplitTypeByMediaType(doc.type),
          chunkSize: doc.metadata?.chunkSize,
          chunkOverlap: doc.metadata?.chunkOverlap
        })
        doc.isSplitting = true
        doc.chunks = splitter
        await updateDocumentStatus(
          knowledge.id,
          doc.id,
          'processing',
          undefined,
          doc.currentChunk,
          true
        )
      } else {
        splitter = doc.chunks!
      }

      // 增量更新逻辑：获取数据库中已有的分块哈希
      let existingChunks: Splitter | undefined
      if (await window.api.sqlite.isSupported()) {
        const docSpecificChunks = await window.api.sqlite.getChunksByDocId(doc.id)

        if (docSpecificChunks.length > 0) {
          existingChunks = docSpecificChunks.map((c: any) => ({
            id: c.id,
            content: c.content,
            content_hash: c.content_hash,
            embedding: typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding
          }))

          // 如果不是 continueFlag，我们需要清理掉数据库中不再需要的旧分块
          if (!continueFlag) {
            const currentHashes = new Set(splitter.map(s => s.content_hash))
            const idsToDelete = docSpecificChunks
              .filter((c: any) => !currentHashes.has(c.content_hash))
              .map((c: any) => c.id)

            if (idsToDelete.length > 0) {
              await window.api.sqlite.deleteChunksByIds(idsToDelete)
            }
          }
        }
      }

      const { model, provider } = getModelById(doc.metadata?.providerId!, doc.metadata?.modelId!)!
      await rag.embedding(splitter, {
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name,
        abortController,
        currentChunk: doc.currentChunk,
        providerOptions,
        existingChunks, // 传入已有的分块用于对比
        onProgress: async (data, current, total, batchChunks) => {
          if (current !== undefined && total !== undefined) {
            doc.currentChunk = current
          }
          if (await window.api.sqlite.isSupported()) {
            if (batchChunks && batchChunks.length > 0) {
              await upsertChunksToSqlite(knowledge.id, doc.id, batchChunks)
              // 同步进度到数据库
              await updateDocumentStatus(
                knowledge.id,
                doc.id,
                'processing',
                undefined,
                doc.currentChunk,
                doc.isSplitting
              )
            }
          } else {
            if (data) {
              doc.chunks = data
            }
          }
        },
        continueFlag,
        batchSize
      })
      doc.status = 'processed'
      await updateDocumentStatus(knowledge.id, doc.id, 'processed', undefined, doc.currentChunk)
    } catch (error) {
      if (abortController.signal.aborted) {
        doc.status = 'aborted'
        await updateDocumentStatus(
          knowledge.id,
          doc.id,
          'aborted',
          undefined,
          doc.currentChunk,
          doc.isSplitting
        )
      } else {
        doc.status = 'error'
        await updateDocumentStatus(
          knowledge.id,
          doc.id,
          'error',
          undefined,
          doc.currentChunk,
          doc.isSplitting
        )
      }
    }
  }

  const search = async (query: string, knowledgeId: string) => {
    const knowledge = knowledgeBases.value.find((k) => k.id === knowledgeId)
    if (!knowledge) return []
    const {
      embeddingModel: { modelId, providerId }
    } = knowledge
    const { model, provider } = getModelById(providerId, modelId)!

    let rerankOptions
    if (knowledge.rerankModel && knowledge.rerankModel.modelId) {
      const { modelId: rerankModelId, providerId: rerankProviderId } = knowledge.rerankModel
      const rerankModelInfo = getModelById(rerankProviderId, rerankModelId)
      if (rerankModelInfo) {
        rerankOptions = {
          apiKey: rerankModelInfo.provider.apiKey!,
          baseURL: rerankModelInfo.provider.baseUrl,
          name: rerankModelInfo.provider.name,
          providerType: rerankModelInfo.provider.providerType,
          model: rerankModelInfo.model.name
        }
      }
    }

    return await rag.retrieve(
      query,
      knowledge,
      {
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        name: provider.name,
        providerType: provider.providerType,
        model: model.name
      },
      knowledge.retrieveConfig,
      rerankOptions
    )
  }

  return { embedding, search }
}
