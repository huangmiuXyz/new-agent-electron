import { app, BrowserWindow, ipcMain } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import http, { IncomingMessage, ServerResponse } from 'http'
import os from 'os'
import path from 'path'

const DEFAULT_PORT = 41235
const SSE_RETRY_MS = 3000

type SyncSnapshot = {
  chats: Chat[]
  activeChatId: string | null
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
const sseClients = new Set<ServerResponse<IncomingMessage>>()
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

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(body))
}

function emitRendererEvent(event: SyncEvent) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('sync:event', event)
  })
}

function broadcastSse(event: SyncEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  sseClients.forEach((client) => client.write(payload))
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

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf-8')
  return text ? JSON.parse(text) : {}
}

function handleEvents(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
  res.write(`retry: ${SSE_RETRY_MS}\n\n`)
  sseClients.add(res)
  res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', state: getState() })}\n\n`)
  res.write(`event: directory\ndata: ${JSON.stringify({ type: 'directory', endpoints: getDirectory() })}\n\n`)
  req.on('close', () => {
    sseClients.delete(res)
    emitState()
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method || 'GET'
  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`)

  if (method === 'OPTIONS') {
    writeJson(res, 204, {})
    return
  }

  if (method === 'GET' && requestUrl.pathname === '/api/sync/status') {
    writeJson(res, 200, getState())
    return
  }

  if (method === 'GET' && requestUrl.pathname === '/api/sync/endpoints') {
    writeJson(res, 200, getDirectory())
    return
  }

  if (method === 'GET' && requestUrl.pathname.startsWith('/api/sync/endpoints/')) {
    const [, api, sync, endpointsPath, endpointId, resource] = requestUrl.pathname.split('/')
    if (api !== 'api' || sync !== 'sync' || endpointsPath !== 'endpoints') {
      writeJson(res, 404, { ok: false, error: 'Not Found' })
      return
    }
    if (resource !== 'snapshot' || !endpointId) {
      writeJson(res, 404, { ok: false, error: 'Not Found' })
      return
    }
    writeJson(res, 200, endpoints.get(endpointId)?.snapshot || null)
    return
  }

  if (method === 'GET' && requestUrl.pathname === '/api/sync/events') {
    handleEvents(req, res)
    return
  }

  if (method === 'POST' && requestUrl.pathname === '/api/sync/register') {
    try {
      const body = (await readJsonBody(req)) as {
        deviceId?: string
        displayName?: string
        source?: string
      }
      if (!body.deviceId) {
        writeJson(res, 400, { ok: false, error: '缺少 deviceId' })
        return
      }
      upsertEndpoint({
        deviceId: body.deviceId,
        displayName: body.displayName || body.deviceId,
        source: body.source || 'mobile'
      })
      emitDirectory()
      writeJson(res, 200, { ok: true })
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (method === 'POST' && requestUrl.pathname === '/api/sync/snapshot') {
    try {
      const body = (await readJsonBody(req)) as {
        deviceId?: string
        displayName?: string
        source?: string
        snapshot?: SyncSnapshot
      }
      if (!body.deviceId || !body.snapshot) {
        writeJson(res, 400, { ok: false, error: '缺少 deviceId 或 snapshot' })
        return
      }
      upsertEndpoint({
        deviceId: body.deviceId,
        displayName: body.displayName || body.deviceId,
        source: body.source || body.snapshot.source || 'mobile',
        snapshot: body.snapshot
      })
      emitDirectory()
      writeJson(res, 200, { ok: true })
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  writeJson(res, 404, { ok: false, error: 'Not Found' })
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
  server = http.createServer((req, res) => {
    void handleRequest(req, res)
  })

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
  sseClients.forEach((client) => client.end())
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
