import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import * as schema from './chatSchema'

let sqliteDb: Database.Database
let drizzleDb: ReturnType<typeof drizzle>

const getMigrationsPath = () => {
  if (is.dev) {
    return join(process.cwd(), 'src/main/db/migrations')
  }
  return join(process.resourcesPath, 'db/migrations')
}

export const initChatDb = () => {
  let dbPath: string
  if (is.dev) {
    dbPath = join(process.cwd(), 'data', 'chat.db')
  } else {
    dbPath = join(app.getPath('userData'), 'Data', 'SQLite', 'chat.db')
  }
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  sqliteDb = new Database(dbPath)
  sqliteDb.pragma('journal_mode = WAL')
  sqliteDb.pragma('foreign_keys = ON')

  drizzleDb = drizzle(sqliteDb, { schema })

  migrate(drizzleDb, {
    migrationsFolder: getMigrationsPath()
  })
}

export const getDb = () => drizzleDb

export const getSqliteDb = () => sqliteDb
