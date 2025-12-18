import Database from 'better-sqlite3'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function initSqlite() {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'Data', 'SQLite', 'storage.db')

  // Ensure directory exists
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)

  // Create storage table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS storage (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  // Register IPC handlers
  ipcMain.handle('sqlite:getItem', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM storage WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row ? row.value : null
  })

  ipcMain.handle('sqlite:setItem', (_event, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)').run(key, value)
  })

  ipcMain.handle('sqlite:removeItem', (_event, key: string) => {
    db.prepare('DELETE FROM storage WHERE key = ?').run(key)
  })

  ipcMain.handle('sqlite:clear', () => {
    db.prepare('DELETE FROM storage').run()
  })
}
