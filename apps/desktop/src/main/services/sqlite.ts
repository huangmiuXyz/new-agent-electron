import Database from 'better-sqlite3'
import * as sqliteVss from 'sqlite-vss'
import { app, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'

let db: Database.Database

export const initSqlite = () => {
  let dbPath: string
  if (is.dev) {
    dbPath = join(process.cwd(), 'data', 'vector.db')
  } else {
    dbPath = join(app.getPath('userData'), 'Data', 'SQLite', 'vector.db')
  }
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)

  try {
    sqliteVss.load(db)
  } catch (e) {
    console.error('Failed to load sqlite-vss:', e)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT,
      kb_id TEXT,
      model_id TEXT,
      content_hash TEXT,
      content TEXT,
      dimension INTEGER
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_hash_model_dim ON chunks(content_hash, model_id, dimension);
  `)
}

const ensureVssTable = (dimension: number) => {
  if (dimension > 0) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks_${dimension}
      USING vss0(vector(${dimension}));
    `)
  }
}

export const setupSqliteHandlers = () => {
  ipcMain.handle('sqlite:isSupported', async () => {
    try {
      return !!db.prepare('SELECT vss_version()').get()
    } catch {
      return false
    }
  })

  ipcMain.handle(
    'sqlite:upsertChunks',
    async (
      _event,
      chunks: {
        id: string
        doc_id: string
        kb_id: string
        model_id: string
        content_hash: string
        content: string
        embedding: number[]
      }[]
    ) => {
      if (!chunks.length) return true

      const dimension = chunks[0].embedding.length
      ensureVssTable(dimension)

      const findChunk = db.prepare('SELECT rowid FROM chunks WHERE id = ?')

      const insertChunk = db.prepare('INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?)')
      const updateChunk = db.prepare(
        'UPDATE chunks SET doc_id=?, kb_id=?, model_id=?, content_hash=?, content=?, dimension=? WHERE id=?'
      )

      const insertVss = db.prepare(
        `INSERT INTO vss_chunks_${dimension} (rowid, vector) VALUES (?, ?)`
      )
      const updateVss = db.prepare(`UPDATE vss_chunks_${dimension} SET vector=? WHERE rowid=?`)

      db.transaction(() => {
        for (const c of chunks) {
          const vector = JSON.stringify(c.embedding)
          const existing = findChunk.get(c.id)

          if (existing) {
            updateChunk.run(c.doc_id, c.kb_id, c.model_id, c.content_hash, c.content, dimension, c.id)
            updateVss.run(vector, existing.rowid)
          } else {
            const res = insertChunk.run(c.id, c.doc_id, c.kb_id, c.model_id, c.content_hash, c.content, dimension)
            insertVss.run(res.lastInsertRowid, vector)
          }
        }
      })()

      return true
    }
  )

  ipcMain.handle(
    'sqlite:updateChunks',
    async (
      _event,
      chunks: {
        id: string
        doc_id: string
        kb_id: string
        content: string
        embedding: number[]
      }[]
    ) => {
      if (!chunks.length) return true

      const dimension = chunks[0].embedding.length
      ensureVssTable(dimension)

      const findByContent = db.prepare('SELECT rowid FROM chunks WHERE content = ?')
      const insertChunk = db.prepare('INSERT INTO chunks VALUES (?, ?, ?, ?, ?)')
      const insertVss = db.prepare(
        `INSERT INTO vss_chunks_${dimension} (rowid, vector) VALUES (?, ?)`
      )

      db.transaction(() => {
        for (const c of chunks) {
          const existing = findByContent.get(c.content)
          if (!existing) {
            const vector = JSON.stringify(c.embedding)
            const res = insertChunk.run(c.id, c.doc_id, c.kb_id, c.content, dimension)
            insertVss.run(res.lastInsertRowid, vector)
          }
        }
      })()

      return true
    }
  )

  ipcMain.handle('sqlite:deleteChunksByDoc', async (_event, doc_id: string) => {
    deleteChunks('doc_id', doc_id)
    return true
  })

  ipcMain.handle('sqlite:deleteChunksByKb', async (_event, kb_id: string) => {
    deleteChunks('kb_id', kb_id)
    return true
  })

  ipcMain.handle(
    'sqlite:search',
    async (
      _event,
      { kb_id, queryEmbedding, topK }: { kb_id: string; queryEmbedding: number[]; topK: number }
    ) => {
      const rows = db
        .prepare('SELECT DISTINCT dimension FROM chunks WHERE kb_id = ?')
        .all(kb_id) as { dimension: number }[]

      if (!rows.length) return []
      if (rows.length > 1) {
        throw new Error(`KB ${kb_id} contains mixed embedding dimensions`)
      }

      const dimension = rows[0].dimension
      if (queryEmbedding.length !== dimension) {
        throw new Error('Query embedding dimension mismatch')
      }

      ensureVssTable(dimension)

      return db
        .prepare(
          `
          SELECT c.id, c.content, c.doc_id, v.distance
          FROM vss_chunks_${dimension} v
          JOIN chunks c ON v.rowid = c.rowid
          WHERE vss_search(v.vector, vss_search_params(?, ?))
            AND c.kb_id = ?
          ORDER BY v.distance ASC
        `
        )
        .all(JSON.stringify(queryEmbedding), Math.max(1, topK || 5), kb_id)
        .map((r) => ({
          id: r.id,
          content: r.content,
          doc_id: r.doc_id,
          score: 1 - r.distance
        }))
    }
  )

  ipcMain.handle('sqlite:getAllChunks', async () => {
    const chunks = db.prepare('SELECT * FROM chunks').all() as any[]
    const result: any[] = []

    for (const chunk of chunks) {
      const dimension = chunk.dimension
      if (dimension > 0) {
        const vssRow = db
          .prepare(`SELECT vector FROM vss_chunks_${dimension} WHERE rowid = ?`)
          .get(chunk.rowid) as { vector: string }
        if (vssRow) {
          result.push({
            id: chunk.id,
            doc_id: chunk.doc_id,
            kb_id: chunk.kb_id,
            content: chunk.content,
            embedding: JSON.parse(vssRow.vector)
          })
        }
      }
    }
    return result
  })

  ipcMain.handle(
    'sqlite:getChunksByHash',
    async (
      _event,
      {
        content_hashes,
        model_id,
        dimension
      }: { content_hashes: string[]; model_id: string; dimension: number }
    ) => {
      if (!content_hashes.length) return []

      const placeholders = content_hashes.map(() => '?').join(',')
      const chunks = db
        .prepare(
          `SELECT * FROM chunks WHERE content_hash IN (${placeholders}) AND model_id = ? AND dimension = ?`
        )
        .all(...content_hashes, model_id, dimension) as any[]

      const result: any[] = []
      for (const chunk of chunks) {
        if (dimension > 0) {
          const vssRow = db
            .prepare(`SELECT vector FROM vss_chunks_${dimension} WHERE rowid = ?`)
            .get(chunk.rowid) as { vector: string }
          if (vssRow) {
            result.push({
              id: chunk.id,
              doc_id: chunk.doc_id,
              kb_id: chunk.kb_id,
              model_id: chunk.model_id,
              content_hash: chunk.content_hash,
              content: chunk.content,
              embedding: JSON.parse(vssRow.vector)
            })
          }
        }
      }
      return result
    }
  )
}

const deleteChunks = (field: 'doc_id' | 'kb_id', value: string) => {
  const rows = db.prepare(`SELECT rowid, dimension FROM chunks WHERE ${field} = ?`).all(value) as {
    rowid: number
    dimension: number
  }[]

  if (!rows.length) return

  db.transaction(() => {
    for (const { rowid, dimension } of rows) {
      db.prepare(`DELETE FROM vss_chunks_${dimension} WHERE rowid = ?`).run(rowid)
    }
    db.prepare(`DELETE FROM chunks WHERE ${field} = ?`).run(value)
  })()
}
