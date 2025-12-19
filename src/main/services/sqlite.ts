import Database from 'better-sqlite3'
import * as sqliteVss from 'sqlite-vss'
import { app, ipcMain } from 'electron'
import { join } from 'path'

let db: Database.Database

export const initSqlite = () => {
  const dbPath = join(app.getPath('userData'), 'vector.db')
  db = new Database(dbPath)

  try {
    sqliteVss.load(db)
  } catch (error) {
    console.error('Failed to load sqlite-vss:', error)
  }

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT,
      kb_id TEXT,
      content TEXT
    );
  `)

  const tableInfo = db.prepare('PRAGMA table_info(chunks)').all() as { name: string }[]
  if (!tableInfo.some((col) => col.name === 'dimension')) {
    db.exec('ALTER TABLE chunks ADD COLUMN dimension INTEGER')
  }

  db.exec('DELETE FROM chunks WHERE dimension IS NULL OR dimension = 0')
}

const ensureVssTable = (dimension: number) => {
  if (dimension <= 0) return
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks_${dimension} USING vss0(
      vector(${dimension})
    );
  `)
}

export const setupSqliteHandlers = () => {
  ipcMain.handle('sqlite:isSupported', async () => {
    try {
      const result = db.prepare('SELECT vss_version() as version').get() as { version: string }
      return !!result.version
    } catch (e) {
      return false
    }
  })

  ipcMain.handle(
    'sqlite:upsertChunks',
    async (
      _event,
      chunks: { id: string; doc_id: string; kb_id: string; content: string; embedding: number[] }[]
    ) => {
      if (chunks.length === 0) return true
      const dimension = Math.floor(chunks[0].embedding.length)
      ensureVssTable(dimension)

      const checkChunk = db.prepare('SELECT rowid, dimension FROM chunks WHERE id = ?')
      const insertChunk = db.prepare(
        'INSERT INTO chunks (id, doc_id, kb_id, content, dimension) VALUES (?, ?, ?, ?, ?)'
      )
      const updateChunk = db.prepare(
        'UPDATE chunks SET doc_id = ?, kb_id = ?, content = ?, dimension = ? WHERE id = ?'
      )

      const insertVss = db.prepare(
        `INSERT INTO vss_chunks_${dimension} (rowid, vector) VALUES (?, ?)`
      )
      const updateVss = db.prepare(`UPDATE vss_chunks_${dimension} SET vector = ? WHERE rowid = ?`)

      const transaction = db.transaction((items) => {
        for (const item of items) {
          const existing = checkChunk.get(item.id) as
            | { rowid: number; dimension: number }
            | undefined
          const vectorJson = JSON.stringify(item.embedding)

          if (existing) {
            if (existing.dimension !== dimension) {
              if (typeof existing.dimension === 'number' && existing.dimension > 0) {
                try {
                  db.prepare(`DELETE FROM vss_chunks_${existing.dimension} WHERE rowid = ?`).run(
                    existing.rowid
                  )
                } catch (e) {
                  // 旧维度表可能不存在
                }
              }
              updateChunk.run(item.doc_id, item.kb_id, item.content, dimension, item.id)
              insertVss.run(existing.rowid, vectorJson)
            } else {
              updateChunk.run(item.doc_id, item.kb_id, item.content, dimension, item.id)
              updateVss.run(vectorJson, existing.rowid)
            }
          } else {
            const result = insertChunk.run(
              item.id,
              item.doc_id,
              item.kb_id,
              item.content,
              dimension
            )
            insertVss.run(result.lastInsertRowid, vectorJson)
          }
        }
      })

      transaction(chunks)
      return true
    }
  )

  ipcMain.handle('sqlite:deleteChunksByDoc', async (_event, doc_id: string) => {
    const rows = db.prepare('SELECT rowid, dimension FROM chunks WHERE doc_id = ?').all() as {
      rowid: number
      dimension: number
    }[]

    if (rows.length > 0) {
      db.transaction(() => {
        for (const row of rows) {
          db.prepare(`DELETE FROM vss_chunks_${row.dimension} WHERE rowid = ?`).run(row.rowid)
        }
        db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(doc_id)
      })()
    }
    return true
  })

  ipcMain.handle('sqlite:deleteChunksByKb', async (_event, kb_id: string) => {
    const rows = db.prepare('SELECT rowid, dimension FROM chunks WHERE kb_id = ?').all() as {
      rowid: number
      dimension: number
    }[]

    if (rows.length > 0) {
      db.transaction(() => {
        for (const row of rows) {
          db.prepare(`DELETE FROM vss_chunks_${row.dimension} WHERE rowid = ?`).run(row.rowid)
        }
        db.prepare('DELETE FROM chunks WHERE kb_id = ?').run(kb_id)
      })()
    }
    return true
  })

  ipcMain.handle(
    'sqlite:search',
    async (
      _event,
      { kb_id, queryEmbedding, topK }: { kb_id: string; queryEmbedding: number[]; topK: number }
    ) => {
      const dimension = queryEmbedding.length
      ensureVssTable(dimension)

      const searchTopK = Math.max(1, topK || 5)
      const results = db
        .prepare(
          `
      SELECT 
        c.id, 
        c.content, 
        v.distance 
      FROM vss_chunks_${dimension} v
      JOIN chunks c ON v.rowid = c.rowid
      WHERE vss_search(v.vector, vss_search_params(?, ?)) AND c.kb_id = ?
      ORDER BY v.distance ASC
    `
        )
        .all(JSON.stringify(queryEmbedding), searchTopK, kb_id) as {
        id: string
        content: string
        distance: number
      }[]

      return results.map((r) => ({
        id: r.id,
        content: r.content,
        score: 1 - r.distance
      }))
    }
  )

  ipcMain.handle(
    'sqlite:cleanupObsolete',
    async (
      _event,
      { validKbIds, validDocIds }: { validKbIds: string[]; validDocIds: string[] }
    ) => {
      const rows = db.prepare('SELECT rowid, dimension, kb_id, doc_id FROM chunks').all() as {
        rowid: number
        dimension: number
        kb_id: string
        doc_id: string
      }[]

      const obsoleteRows = rows.filter(
        (row) => !validKbIds.includes(row.kb_id) || !validDocIds.includes(row.doc_id)
      )

      if (obsoleteRows.length > 0) {
        db.transaction(() => {
          for (const row of obsoleteRows) {
            if (typeof row.dimension === 'number' && row.dimension > 0) {
              try {
                db.prepare(`DELETE FROM vss_chunks_${row.dimension} WHERE rowid = ?`).run(row.rowid)
              } catch (e) {
                // Table might not exist or dimension is invalid
              }
            }
            db.prepare('DELETE FROM chunks WHERE rowid = ?').run(row.rowid)
          }
        })()
      }
      return obsoleteRows.length
    }
  )
}
