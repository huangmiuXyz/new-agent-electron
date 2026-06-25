import localforage from 'localforage'
import { STORAGE_KEY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION } from './constants'
import { isMessagesKey } from './chat-serializer'

const OLD_CHATS_KEY = 'chats'

export async function getSchemaVersion(): Promise<number | null> {
  const version = await localforage.getItem<number>(STORAGE_KEY_SCHEMA_VERSION)
  return version ?? null
}

export async function cleanupOldStorage(): Promise<void> {
  const oldData = await localforage.getItem(OLD_CHATS_KEY)
  if (oldData != null) {
    await localforage.removeItem(OLD_CHATS_KEY)
  }
}

async function deleteAllChatMessageKeys(): Promise<void> {
  const keys = await localforage.keys()
  const chatKeys = keys.filter(isMessagesKey)
  await Promise.all(chatKeys.map((key) => localforage.removeItem(key)))
}

export async function initializeChatStorage(): Promise<void> {
  const version = await getSchemaVersion()

  if (version === CURRENT_SCHEMA_VERSION) {
    return
  }

  if (version == null) {
    await cleanupOldStorage()
    await localforage.setItem(STORAGE_KEY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION)
    return
  }

  await deleteAllChatMessageKeys()
  await localforage.setItem(STORAGE_KEY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION)
}
