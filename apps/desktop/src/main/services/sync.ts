import { app, BrowserWindow, ipcMain } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import Koa from 'koa'
import Router from '@koa/router'

const DEFAULT_PORT = 41235
const SSE_RETRY_MS = 3000

type SyncSnapshot = {
  chats: Chat[]
  activeChatId: string | null
  providers: Provider[]
  providerOrder: string[]
  updatedAt: number
  source: string
}

type SyncHostState = {
  running: boolean
  port: number
  displayName: string
  deviceId: string
  urls: string[]
  connectedClients: number
  snapshotUpdatedAt?: number
  error?: string
}

type SyncEndpoint = {
  deviceId: string
  displayName: string
  source: string
  lastSeenAt: number
  snapshotUpdatedAt?: number
  messageCount: number
  chatCount: number
}

type SyncEndpointRecord = SyncEndpoint & {
  snapshot: SyncSnapshot | null
}

type SyncEvent =
  | { type: 'state'; state: SyncHostState }
  | { type: 'directory'; endpoints: SyncEndpoint[] }

let server: http.Server | null = null
const sseClients = new Set<http.ServerResponse>()
const endpoints = new Map<string, SyncEndpointRecord>()
let deviceId = ''
let displayName = ''
let port = DEFAULT_PORT
let lastError = ''

function getDeviceId() {
  if (deviceId) return deviceId
  const filePath = path.join(app.getPath('userData'), 'sync-device-id')
  try {
    if (fs.existsSync(filePath)) {
      deviceId = fs.readFileSync(filePath, 'utf-8').trim()
      return deviceId
    }
  } catch {}

  deviceId = crypto.randomUUID()
  try {
    fs.writeFileSync(filePath, deviceId, 'utf-8')
  } catch {}
  return deviceId
}

function getDisplayName() {
  return displayName || os.hostname() || 'Agent-QI'
}

function getUrls() {
  const urls = new Set<string>([`http://127.0.0.1:${port}`])
  const interfaces = os.networkInterfaces()
  Object.values(interfaces).forEach((group) => {
    group?.forEach((addressInfo) => {
      if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
        urls.add(`http://${addressInfo.address}:${port}`)
      }
    })
  })
  return Array.from(urls)
}

function getSelfRecord() {
  return endpoints.get(getDeviceId())
}

function getState(): SyncHostState {
  return {
    running: Boolean(server),
    port,
    displayName: getDisplayName(),
    deviceId: getDeviceId(),
    urls: getUrls(),
    connectedClients: sseClients.size,
    snapshotUpdatedAt: getSelfRecord()?.snapshotUpdatedAt,
    error: lastError || undefined
  }
}

function getMessageCount(snapshot: SyncSnapshot | null) {
  return snapshot?.chats.reduce((sum, chat) => sum + chat.messages.length, 0) || 0
}

function toEndpointRecord(input: {
  deviceId: string
  displayName: string
  source: string
  snapshot?: SyncSnapshot | null
}): SyncEndpointRecord {
  const now = Date.now()
  return {
    deviceId: input.deviceId,
    displayName: input.displayName,
    source: input.source,
    lastSeenAt: now,
    snapshotUpdatedAt: input.snapshot?.updatedAt,
    messageCount: getMessageCount(input.snapshot || null),
    chatCount: input.snapshot?.chats.length || 0,
    snapshot: input.snapshot || null
  }
}

function upsertEndpoint(input: {
  deviceId: string
  displayName: string
  source: string
  snapshot?: SyncSnapshot | null
}) {
  const current = endpoints.get(input.deviceId)
  const next = toEndpointRecord({
    deviceId: input.deviceId,
    displayName: input.displayName || current?.displayName || input.deviceId,
    source: input.source || current?.source || 'unknown',
    snapshot: input.snapshot === undefined ? current?.snapshot || null : input.snapshot
  })
  endpoints.set(input.deviceId, next)
  return next
}

function getDirectory(): SyncEndpoint[] {
  return Array.from(endpoints.values())
    .map(({ snapshot, ...endpoint }) => endpoint)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

function emitRendererEvent(event: SyncEvent) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('sync:event', event)
  })
}

function broadcastSse(event: SyncEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  sseClients.forEach((res) => {
    res.write(payload)
  })
}

function emitState() {
  const event: SyncEvent = { type: 'state', state: getState() }
  emitRendererEvent(event)
  broadcastSse(event)
}

function emitDirectory() {
  const event: SyncEvent = { type: 'directory', endpoints: getDirectory() }
  emitRendererEvent(event)
  broadcastSse(event)
  emitState()
}

interface SyncKoaState {
  body?: unknown
}

function setupRouter() {
  const router = new Router<SyncKoaState>()

  // GET /api/sync/status
  router.get('/api/sync/status', (ctx) => {
    ctx.body = getState()
  })

  // GET /api/sync/endpoints
  router.get('/api/sync/endpoints', (ctx) => {
    ctx.body = getDirectory()
  })

  // GET /api/sync/endpoints/:id/snapshot
  router.get('/api/sync/endpoints/:id/snapshot', (ctx) => {
    const { id } = ctx.params
    const record = endpoints.get(id)
    ctx.body = record?.snapshot || null
  })

  // GET /api/sync/events (SSE)
  router.get('/api/sync/events', (ctx) => {
    ctx.status = 200
    ctx.set('Content-Type', 'text/event-stream')
    ctx.set('Cache-Control', 'no-cache, no-transform')
    ctx.set('Connection', 'keep-alive')

    // Manually write headers
    ctx.res.flushHeaders()

    ctx.res.write(`retry: ${SSE_RETRY_MS}\n\n`)
    sseClients.add(ctx.res)

    ctx.res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', state: getState() })}\n\n`)
    ctx.res.write(
      `event: directory\ndata: ${JSON.stringify({ type: 'directory', endpoints: getDirectory() })}\n\n`
    )

    ctx.req.on('close', () => {
      sseClients.delete(ctx.res)
      emitState()
    })

    // Keep the connection open - don't call ctx.body = ...
    ctx.respond = false
  })

  // POST /api/sync/register
  router.post('/api/sync/register', (ctx) => {
    const body = ctx.state.body as { deviceId?: string; displayName?: string; source?: string } | undefined

    if (!body?.deviceId) {
      ctx.status = 400
      ctx.body = { ok: false, error: '缺少 deviceId' }
      return
    }

    upsertEndpoint({
      deviceId: body.deviceId,
      displayName: body.displayName || body.deviceId,
      source: body.source || 'mobile'
    })
    emitDirectory()
    ctx.body = { ok: true }
  })

  // POST /api/sync/snapshot
  router.post('/api/sync/snapshot', (ctx) => {
    const body = ctx.state.body as {
      deviceId?: string
      displayName?: string
      source?: string
      snapshot?: SyncSnapshot
    } | undefined

    if (!body?.deviceId || !body?.snapshot) {
      ctx.status = 400
      ctx.body = { ok: false, error: '缺少 deviceId 或 snapshot' }
      return
    }

    upsertEndpoint({
      deviceId: body.deviceId,
      displayName: body.displayName || body.deviceId,
      source: body.source || body.snapshot.source || 'mobile',
      snapshot: body.snapshot
    })
    emitDirectory()
    ctx.body = { ok: true }
  })

  return router
}

async function startSyncHost(options?: { displayName?: string; port?: number }) {
  if (options?.displayName?.trim()) {
    displayName = options.displayName.trim()
  } else if (!displayName) {
    displayName = os.hostname() || 'Agent-QI'
  }
  if (options?.port) {
    port = options.port
  }

  upsertEndpoint({
    deviceId: getDeviceId(),
    displayName: getDisplayName(),
    source: 'desktop'
  })

  if (server) {
    emitDirectory()
    return getState()
  }

  lastError = ''

  const koa = new Koa<SyncKoaState>()
  const router = setupRouter()

  // CORS middleware
  koa.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*')
    ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    ctx.set('Access-Control-Allow-Headers', 'Content-Type')
    ctx.set('Access-Control-Allow-Private-Network', 'true')

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204
      return
    }

    await next()
  })

  // Body parser middleware
  koa.use(async (ctx, next) => {
    if (ctx.method === 'POST' || ctx.method === 'PUT') {
      try {
        const text = await new Promise<string>((resolve, reject) => {
          let data = ''
          ctx.req.on('data', (chunk) => {
            data += chunk
          })
          ctx.req.on('end', () => resolve(data))
          ctx.req.on('error', reject)
        })
        ctx.state.body = text ? JSON.parse(text) : {}
      } catch {
        ctx.state.body = {}
      }
    }
    await next()
  })

  koa.use(router.routes())
  koa.use(router.allowedMethods())

  server = http.createServer(koa.callback())

  await new Promise<void>((resolve, reject) => {
    server?.once('listening', () => resolve())
    server?.once('error', (error) => reject(error))
    server?.listen(port, '0.0.0.0')
  })

  server.on('error', (error) => {
    lastError = error.message
    emitState()
  })

  emitDirectory()
  return getState()
}

async function stopSyncHost() {
  if (!server) return getState()

  const activeServer = server
  server = null
  sseClients.forEach((res) => {
    res.end()
  })
  sseClients.clear()
  await new Promise<void>((resolve) => activeServer.close(() => resolve()))
  emitState()
  return getState()
}

export function setupSyncHandlers() {
  ipcMain.handle('sync:start-host', async (_event, options?: { displayName?: string; port?: number }) => {
    return startSyncHost(options)
  })

  ipcMain.handle('sync:stop-host', async () => {
    return stopSyncHost()
  })

  ipcMain.handle('sync:get-host-state', async () => {
    return getState()
  })

  ipcMain.handle('sync:update-profile', async (_event, options?: { displayName?: string }) => {
    return startSyncHost(options)
  })

  ipcMain.handle(
    'sync:publish-snapshot',
    async (_event, payload: { deviceId: string; displayName: string; snapshot: SyncSnapshot }) => {
      upsertEndpoint({
        deviceId: payload.deviceId,
        displayName: payload.displayName,
        source: payload.snapshot.source,
        snapshot: payload.snapshot
      })
      emitDirectory()
      return { ok: true }
    }
  )

  ipcMain.handle('sync:list-endpoints', async () => {
    return getDirectory()
  })

  ipcMain.handle('sync:get-endpoint-snapshot', async (_event, endpointId: string) => {
    return endpoints.get(endpointId)?.snapshot || null
  })

  app.on('before-quit', () => {
    void stopSyncHost()
  })
}
