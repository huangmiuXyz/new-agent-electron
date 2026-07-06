import { ipcMain } from 'electron'
import { chatDatabaseService } from '../services/chatDatabase'

export const setupChatDbHandlers = () => {
  ipcMain.handle('chatDb:chat:list', async () => {
    return await chatDatabaseService.listChats()
  })

  ipcMain.handle('chatDb:chat:create', async (_event, summary: ChatSummary) => {
    await chatDatabaseService.createChat(summary)
  })

  ipcMain.handle('chatDb:chat:update', async (_event, chatId: string, updates: Partial<ChatSummary>) => {
    await chatDatabaseService.updateChatMeta(chatId, updates)
  })

  ipcMain.handle('chatDb:chat:delete', async (_event, chatId: string) => {
    await chatDatabaseService.deleteChat(chatId)
  })

  ipcMain.handle('chatDb:message:loadRecent', async (_event, chatId: string, limit: number) => {
    return await chatDatabaseService.loadRecentMessages(chatId, limit)
  })

  ipcMain.handle('chatDb:message:loadBefore', async (_event, chatId: string, beforeOrder: number, limit: number) => {
    return await chatDatabaseService.loadMessagesBefore(chatId, beforeOrder, limit)
  })

  ipcMain.handle('chatDb:message:loadAll', async (_event, chatId: string) => {
    return await chatDatabaseService.loadAllMessages(chatId)
  })

  ipcMain.handle('chatDb:message:replaceAll', async (_event, chatId: string, messages: BaseMessage[]) => {
    await chatDatabaseService.replaceMessages(chatId, messages)
  })

  ipcMain.handle('chatDb:message:replaceFrom', async (_event, chatId: string, anchorMessageId: string, messages: BaseMessage[]) => {
    await chatDatabaseService.replaceMessagesFrom(chatId, anchorMessageId, messages)
  })

  ipcMain.handle('chatDb:message:append', async (_event, chatId: string, messages: BaseMessage[]) => {
    await chatDatabaseService.appendMessages(chatId, messages)
  })

  ipcMain.handle('chatDb:message:delete', async (_event, messageId: string) => {
    await chatDatabaseService.deleteMessage(messageId)
  })

  ipcMain.handle('chatDb:message:deleteAll', async (_event, chatId: string) => {
    await chatDatabaseService.deleteChatMessages(chatId)
  })

  ipcMain.handle('chatDb:message:clearAll', async () => {
    await chatDatabaseService.clearAllChatMessages()
  })

  ipcMain.handle('chatDb:message:upsert', async (_event, chatId: string, message: BaseMessage, seqHint?: number) => {
    await chatDatabaseService.upsertMessage(chatId, message, seqHint)
  })

  ipcMain.handle('chatDb:message:replaceParts', async (_event, messageId: string, parts: BaseMessage['parts']) => {
    await chatDatabaseService.replaceMessageParts(messageId, parts)
  })

  ipcMain.handle('chatDb:message:upsertPart', async (_event, messageId: string, idx: number, part: BaseMessage['parts'][number]) => {
    await chatDatabaseService.upsertMessagePart(messageId, idx, part)
  })

  ipcMain.handle('chatDb:message:updateMetadata', async (_event, messageId: string, metadata: MetaData) => {
    await chatDatabaseService.updateMessageMetadata(messageId, metadata)
  })

  ipcMain.handle('chatDb:message:finalize', async (_event, chatId: string, messageId: string, metadata: MetaData) => {
    await chatDatabaseService.finalizeMessage(chatId, messageId, metadata)
  })

  ipcMain.handle('chatDb:snapshot:export', async (_event, options: {
    summaries: ChatSummary[]
    activeChatId: string | null
    chatDrafts: Record<string, string>
  }) => {
    return await chatDatabaseService.exportSnapshot(options)
  })

  ipcMain.handle('chatDb:snapshot:import', async (_event, snapshot: ChatRepositorySnapshot) => {
    await chatDatabaseService.importSnapshot(snapshot)
  })
}
