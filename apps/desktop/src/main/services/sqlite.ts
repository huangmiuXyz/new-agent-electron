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
      content TEXT,
      dimension INTEGER,
      content_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      embeddingModel TEXT,
      rerankModel TEXT,
      embeddingConfig TEXT,
      retrieveConfig TEXT,
      active INTEGER DEFAULT 1,
      created INTEGER
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      kb_id TEXT,
      name TEXT NOT NULL,
      path TEXT,
      type TEXT,
      size INTEGER,
      status TEXT,
      created INTEGER,
      metadata TEXT,
      url TEXT,
      currentChunk INTEGER DEFAULT 0,
      isSplitting INTEGER DEFAULT 0,
      FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    );
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
        content: string
        embedding: number[]
        content_hash?: string
      }[]
    ) => {
      if (!chunks.length) return true

      const dimension = chunks[0].embedding.length
      ensureVssTable(dimension)

      const findChunk = db.prepare('SELECT rowid FROM chunks WHERE id = ?')
      const findDocDim = db.prepare('SELECT DISTINCT dimension FROM chunks WHERE doc_id = ?')

      const insertChunk = db.prepare('INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?)')
      const updateChunk = db.prepare(
        'UPDATE chunks SET doc_id=?, kb_id=?, content=?, dimension=?, content_hash=? WHERE id=?'
      )

      const insertVss = db.prepare(
        `INSERT INTO vss_chunks_${dimension} (rowid, vector) VALUES (?, ?)`
      )
      const updateVss = db.prepare(`UPDATE vss_chunks_${dimension} SET vector=? WHERE rowid=?`)

      db.transaction(() => {
        for (const c of chunks) {
          const docDim = findDocDim.get(c.doc_id)?.dimension
          if (docDim && docDim !== dimension) {
            throw new Error(`Document ${c.doc_id} embedding dimension mismatch`)
          }

          const vector = JSON.stringify(c.embedding)
          const existing = findChunk.get(c.id)

          if (existing) {
            updateChunk.run(c.doc_id, c.kb_id, c.content, dimension, c.content_hash || '', c.id)
            updateVss.run(vector, existing.rowid)
          } else {
            const res = insertChunk.run(
              c.id,
              c.doc_id,
              c.kb_id,
              c.content,
              dimension,
              c.content_hash || ''
            )
            insertVss.run(res.lastInsertRowid, vector)
          }
        }
      })()

      return true
    }
  )

  ipcMain.handle('sqlite:getDocChunksHash', async (_event, doc_id: string) => {
    return db
      .prepare('SELECT id, content_hash FROM chunks WHERE doc_id = ?')
      .all(doc_id) as { id: string; content_hash: string }[]
  })

  ipcMain.handle('sqlite:getChunksByDocId', async (_event, docId: string) => {
    const chunks = db.prepare('SELECT rowid, * FROM chunks WHERE doc_id = ?').all(docId) as any[]
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
            content_hash: chunk.content_hash,
            embedding: vssRow.vector
          })
        }
      }
    }
    return result
  })

  ipcMain.handle('sqlite:deleteChunksByIds', async (_event, ids: string[]) => {
    if (!ids.length) return true

    db.transaction(() => {
      const deleteChunk = db.prepare('DELETE FROM chunks WHERE id = ?')
      const findRowId = db.prepare('SELECT rowid, dimension FROM chunks WHERE id = ?')

      for (const id of ids) {
        const info = findRowId.get(id) as { rowid: number; dimension: number } | undefined
        if (info) {
          db.prepare(`DELETE FROM vss_chunks_${info.dimension} WHERE rowid = ?`).run(info.rowid)
          deleteChunk.run(id)
        }
      }
    })()
    return true
  })

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
    const chunks = db.prepare('SELECT rowid, * FROM chunks').all() as any[]
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
            content_hash: chunk.content_hash,
            embedding: vssRow.vector
          })
        }
      }
    }
    return result
  })

  // Knowledge Bases
  ipcMain.handle('sqlite:getKnowledgeBases', async () => {
    const kbs = db.prepare('SELECT * FROM knowledge_bases').all() as any[]
    return kbs.map((kb) => ({
      ...kb,
      embeddingModel: JSON.parse(kb.embeddingModel || '{}'),
      rerankModel: JSON.parse(kb.rerankModel || '{}'),
      embeddingConfig: JSON.parse(kb.embeddingConfig || '{}'),
      retrieveConfig: JSON.parse(kb.retrieveConfig || '{}'),
      active: !!kb.active
    }))
  })

  ipcMain.handle('sqlite:upsertKnowledgeBase', async (_event, kb: any) => {
    const upsert = db.prepare(`
      INSERT INTO knowledge_bases (id, name, description, embeddingModel, rerankModel, embeddingConfig, retrieveConfig, active, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        embeddingModel=excluded.embeddingModel,
        rerankModel=excluded.rerankModel,
        embeddingConfig=excluded.embeddingConfig,
        retrieveConfig=excluded.retrieveConfig,
        active=excluded.active,
        created=excluded.created
    `)
    upsert.run(
      kb.id,
      kb.name,
      kb.description || '',
      JSON.stringify(kb.embeddingModel || {}),
      JSON.stringify(kb.rerankModel || {}),
      JSON.stringify(kb.embeddingConfig || {}),
      JSON.stringify(kb.retrieveConfig || {}),
      kb.active ? 1 : 0,
      kb.created || Date.now()
    )
    return true
  })

  ipcMain.handle('sqlite:deleteKnowledgeBase', async (_event, id: string) => {
    db.transaction(() => {
      // Chunks and VSS chunks will be handled by existing logic or cascade
      deleteChunks('kb_id', id)
      db.prepare('DELETE FROM documents WHERE kb_id = ?').run(id)
      db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id)
    })()
    return true
  })

  // Documents
  ipcMain.handle('sqlite:getDocuments', async (_event, kb_id: string) => {
    const docs = db.prepare('SELECT * FROM documents WHERE kb_id = ?').all(kb_id) as any[]
    return docs.map((doc) => ({
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}')
    }))
  })

  ipcMain.handle('sqlite:upsertDocument', async (_event, doc: any) => {
    const upsert = db.prepare(`
      INSERT INTO documents (id, kb_id, name, path, type, size, status, created, metadata, url, currentChunk, isSplitting)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kb_id=excluded.kb_id,
        name=excluded.name,
        path=excluded.path,
        type=excluded.type,
        size=excluded.size,
        status=excluded.status,
        created=excluded.created,
        metadata=excluded.metadata,
        url=excluded.url,
        currentChunk=excluded.currentChunk,
        isSplitting=excluded.isSplitting
    `)
    upsert.run(
      doc.id,
      doc.kb_id,
      doc.name,
      doc.path || '',
      doc.type || '',
      doc.size || 0,
      doc.status || 'pending',
      doc.created || Date.now(),
      JSON.stringify(doc.metadata || {}),
      doc.url || '',
      doc.currentChunk || 0,
      doc.isSplitting ? 1 : 0
    )
    return true
  })

  ipcMain.handle('sqlite:deleteDocument', async (_event, docId: string) => {
    db.transaction(() => {
      deleteChunks('doc_id', docId)
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
    })()
    return true
  })
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
