import Database from 'better-sqlite3'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import * as sqliteVss from 'sqlite-vss'

let db: Database.Database
let isSqliteSupported = false
let isVssSupported = false

export function initSqlite() {
  try {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'Data', 'SQLite', 'storage.db')

    // Ensure directory exists
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    db = new Database(dbPath)
    isSqliteSupported = true

    // Load sqlite-vss
    try {
      sqliteVss.load(db)
      console.log('Successfully loaded sqlite-vss')
      isVssSupported = true
    } catch (err) {
      console.error('Failed to load sqlite-vss:', err)
      isVssSupported = false
    }

    // Create storage table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS storage (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    // Create chunks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kb_id TEXT,
        doc_id TEXT,
        content TEXT,
        metadata TEXT
      )
    `)
  } catch (err) {
    console.error('Failed to initialize SQLite:', err)
    isSqliteSupported = false
  }

  // Register IPC handlers
  ipcMain.handle('sqlite:isSupported', () => {
    return {
      sqlite: isSqliteSupported,
      vss: isVssSupported
    }
  })

  if (!isSqliteSupported) return

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

  // Vector Search IPC Handlers
  ipcMain.handle('sqlite:initVssTable', (_event, dimension: number) => {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks USING vss0(
        embedding(${dimension})
      )
    `)
  })

  ipcMain.handle('sqlite:insertChunks', (_event, chunks: any[]) => {
    const insertChunk = db.prepare(
      'INSERT INTO chunks (kb_id, doc_id, content, metadata) VALUES (?, ?, ?, ?)'
    )
    const insertVss = db.prepare('INSERT INTO vss_chunks (rowid, embedding) VALUES (?, ?)')

    const transaction = db.transaction((chunkList) => {
      for (const chunk of chunkList) {
        const info = insertChunk.run(
          chunk.kb_id,
          chunk.doc_id,
          chunk.content,
          JSON.stringify(chunk.metadata || {})
        )
        insertVss.run(info.lastInsertRowid, JSON.stringify(chunk.embedding))
      }
    })

    transaction(chunks)
  })

  ipcMain.handle('sqlite:searchChunks', (_event, kb_id: string, embedding: number[], limit = 5) => {
    const results = db
      .prepare(
        `
      SELECT
        c.content,
        c.doc_id,
        c.metadata,
        v.distance AS score
      FROM vss_chunks v
      JOIN chunks c ON v.rowid = c.id
      WHERE vss_search(v.embedding, vss_search_params(?, ?))
      AND c.kb_id = ?
      ORDER BY v.distance ASC
      LIMIT ?
    `
      )
      .all(JSON.stringify(embedding), limit, kb_id, limit)

    return results.map((r: any) => ({
      ...r,
      metadata: JSON.parse(r.metadata),
      score: r.score
    }))
  })

  ipcMain.handle('sqlite:deleteChunksByDoc', (_event, doc_id: string) => {
    const chunksToDelete = db.prepare('SELECT id FROM chunks WHERE doc_id = ?').all(doc_id) as {
      id: number
    }[]
    const ids = chunksToDelete.map((c) => c.id)

    if (ids.length > 0) {
      db.prepare(`DELETE FROM vss_chunks WHERE rowid IN (${ids.join(',')})`).run()
      db.prepare(`DELETE FROM chunks WHERE doc_id = ?`).run(doc_id)
    }
  })

  ipcMain.handle('sqlite:deleteChunksByKb', (_event, kb_id: string) => {
    const chunksToDelete = db.prepare('SELECT id FROM chunks WHERE kb_id = ?').all(kb_id) as {
      id: number
    }[]
    const ids = chunksToDelete.map((c) => c.id)

    if (ids.length > 0) {
      db.prepare(`DELETE FROM vss_chunks WHERE rowid IN (${ids.join(',')})`).run()
      db.prepare(`DELETE FROM chunks WHERE kb_id = ?`).run(kb_id)
    }
  })

  ipcMain.handle('sqlite:getChunksByDoc', (_event, doc_id: string) => {
    const rows = db
      .prepare(
        `
      SELECT c.content, v.embedding
      FROM chunks c
      JOIN vss_chunks v ON c.id = v.rowid
      WHERE c.doc_id = ?
    `
      )
      .all(doc_id) as { content: string; embedding: string }[]

    return rows.map((r) => ({
      content: r.content,
      embedding: JSON.parse(r.embedding)
    }))
  })
}
