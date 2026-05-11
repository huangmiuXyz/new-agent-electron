type ProviderConfig = {
  id: string
  name: string
  providerType: string
  apiKey: string
  baseUrl: string
  models: Array<{
    id: string
    name?: string
    description?: string
    category?: string
    active?: boolean
  }>
}

type RawProviderConfig = {
  id?: string
  name?: string
  providerType?: string
  apiKey?: string
  apiKeys?: Array<{ id?: string; key?: string }>
  activeApiKeyId?: string
  baseUrl?: string
  hide?: boolean
  models?: Array<{
    id?: string
    name?: string
    description?: string
    category?: string
    active?: boolean
  }>
}

type PluginConfig = {
  enabled?: boolean
  host: string
  port: number
  apiKey: string
  adminKey: string
  model?: { providerId?: string; modelId?: string }
}

type ServerConfig = {
  host: string
  port: number
  apiKey: string
  adminKey: string
  defaultProviderId: string
  defaultModelId: string
  providers: ProviderConfig[]
}

type RuntimeContext = {
  modules?: Record<string, any>
}

type ServerCommand =
  | { action: 'start'; config: PluginConfig; providers: RawProviderConfig[] }
  | { action: 'stop'; config: PluginConfig }
  | { action: 'health'; config: PluginConfig }

const normalizeHost = (value: string) => String(value || '127.0.0.1').trim() || '127.0.0.1'
const normalizePort = (value: number) => Number(value || 18188) || 18188
const nowSeconds = () => Math.floor(Date.now() / 1000)
const getBaseURL = (config: Pick<PluginConfig, 'host' | 'port'>) =>
  `http://${normalizeHost(config.host)}:${normalizePort(config.port)}`

const getHeader = (headers: Record<string, string | string[] | undefined>, key: string) => {
  const value = headers[key.toLowerCase()] || headers[key]
  return Array.isArray(value) ? value[0] : value || ''
}

const getBearer = (headers: Record<string, string | string[] | undefined>) => {
  const match = /^Bearer\s+(.+)$/i.exec(String(getHeader(headers, 'authorization')))
  return match ? match[1].trim() : ''
}

const sendJson = (res: any, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(JSON.stringify(payload))
}

const sendSseHead = (res: any) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  })
  res.flushHeaders?.()
}

const writeSse = (res: any, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  res.flush?.()
}

const readJsonBody = (req: any) =>
  new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })

const resolveProviderAndModel = (
  config: ServerConfig,
  requestedModel: string
) => {
  const [requestedProviderId, requestedModelId] = String(requestedModel || '').includes(':')
    ? String(requestedModel).split(/:(.*)/s).filter(Boolean)
    : ['', String(requestedModel || '')]

  const provider =
    config.providers.find((item) => item.id === requestedProviderId) ||
    config.providers.find((item) => item.id === config.defaultProviderId) ||
    config.providers.find((item) => item.models.some((model) => model.id === requestedModelId)) ||
    config.providers[0]

  if (!provider) {
    throw new Error('No Agent-Qi provider is configured.')
  }

  const modelId = requestedProviderId
    ? requestedModelId
    : requestedModelId || config.defaultModelId || provider.models[0]?.id

  if (!modelId) {
    throw new Error(`No model is configured for provider "${provider.name}".`)
  }

  return {
    provider,
    modelId
  }
}

const toOpenAIModels = (config: ServerConfig) =>
  config.providers.flatMap((provider) =>
    (provider.models || [])
      .filter((model) => !model.category || model.category === 'text')
      .map((model) => ({
        id: `${provider.id}:${model.id}`,
        object: 'model',
        created: nowSeconds(),
        owned_by: provider.id,
        name: model.name || model.id,
        description: model.description || ''
      }))
  )

const getProviderApiKey = (provider: RawProviderConfig) => {
  if (provider.apiKey) return String(provider.apiKey)
  const active = provider.apiKeys?.find((item) => item.id === provider.activeApiKeyId)
  return String(active?.key || provider.apiKeys?.[0]?.key || '')
}

const normalizeProviders = (providers: RawProviderConfig[]): ProviderConfig[] =>
  (providers || [])
    .filter((provider) => provider.providerType && !provider.hide)
    .map((provider) => ({
      id: String(provider.id || ''),
      name: String(provider.name || provider.id || ''),
      providerType: String(provider.providerType || ''),
      apiKey: getProviderApiKey(provider),
      baseUrl: String(provider.baseUrl || ''),
      models: (provider.models || [])
        .filter((model) => !model.category || model.category === 'text')
        .map((model) => ({
          id: String(model.id || ''),
          name: String(model.name || model.id || ''),
          description: model.description ? String(model.description) : undefined,
          category: model.category ? String(model.category) : undefined,
          active: Boolean(model.active)
        }))
    }))
    .filter((provider) => provider.id && provider.providerType && provider.models.length > 0)

const buildServerConfig = (config: PluginConfig, rawProviders: RawProviderConfig[]): ServerConfig => {
  const providers = normalizeProviders(rawProviders)
  const fallbackProvider = providers[0]
  const selectedProvider =
    providers.find((provider) => provider.id === config.model?.providerId) || fallbackProvider
  const selectedModel =
    selectedProvider?.models.find((model) => model.id === config.model?.modelId) ||
    selectedProvider?.models[0]

  if (!selectedProvider || !selectedModel) {
    throw new Error('No available text model. Configure a Provider and model in Agent-Qi first.')
  }

  return {
    host: normalizeHost(config.host),
    port: normalizePort(config.port),
    apiKey: String(config.apiKey || '').trim(),
    adminKey: String(config.adminKey || '').trim(),
    defaultProviderId: selectedProvider.id,
    defaultModelId: selectedModel.id,
    providers
  }
}

const requestJson = async (targetUrl: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
} = {}) => {
  const { request } = require(targetUrl.startsWith('https:') ? 'node:https' : 'node:http')

  return await new Promise<{ ok: boolean; status?: number; text?: string; json?: any; error?: string }>((resolve) => {
    const req = request(targetUrl, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res: any) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: any
        try {
          json = text ? JSON.parse(text) : null
        } catch {
          json = null
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text,
          json
        })
      })
    })
    req.on('error', (error: Error) => resolve({ ok: false, error: error.message }))
    if (options.body) req.write(options.body)
    req.end()
  })
}

const stripTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '')

const resolveOpenAIEndpoint = (provider: ProviderConfig, pathname: string) => {
  const baseUrl = stripTrailingSlash(provider.baseUrl)
  if (!baseUrl) throw new Error(`Provider "${provider.name}" is missing baseUrl.`)
  return `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

const buildUpstreamHeaders = (provider: ProviderConfig, incomingHeaders: Record<string, string | string[] | undefined>) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
    Accept: String(getHeader(incomingHeaders, 'accept') || 'application/json')
  }

  const userAgent = getHeader(incomingHeaders, 'user-agent')
  if (userAgent) headers['User-Agent'] = String(userAgent)

  return headers
}

const pipeUpstreamResponse = async (upstream: any, res: any) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*'
  }
  const contentType = upstream.headers.get('content-type')
  if (contentType) headers['Content-Type'] = contentType
  const cacheControl = upstream.headers.get('cache-control')
  if (cacheControl) headers['Cache-Control'] = cacheControl

  if (contentType?.includes('text/event-stream')) {
    headers.Connection = 'keep-alive'
    headers['X-Accel-Buffering'] = 'no'
  }

  res.writeHead(upstream.status, headers)
  res.flushHeaders?.()

  if (!upstream.body) {
    res.end()
    return
  }

  for await (const chunk of upstream.body) {
    if (res.destroyed || res.writableEnded) return
    res.write(chunk)
    res.flush?.()
  }
  res.end()
}

const stopServer = async (config: PluginConfig) =>
  await requestJson(`${getBaseURL(config)}/shutdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey: config.adminKey })
  })

const checkHealth = async (config: PluginConfig) =>
  await requestJson(`${getBaseURL(config)}/health`)

const startServer = async (
  config: ServerConfig,
  runtime: RuntimeContext
) => {
  const http = require('node:http')
  const { URL } = require('node:url')

  const host = normalizeHost(config.host)
  const port = normalizePort(config.port)

  const server = http.createServer(async (req: any, res: any) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)

      if (req.method === 'OPTIONS') {
        return sendJson(res, 204, {})
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {
          ok: true,
          providerCount: config.providers.length,
          defaultProviderId: config.defaultProviderId,
          defaultModelId: config.defaultModelId
        })
      }

      if (req.method === 'POST' && url.pathname === '/shutdown') {
        const body = await readJsonBody(req)
        if (body?.adminKey !== config.adminKey) {
          return sendJson(res, 401, { error: { message: 'Invalid admin key.' } })
        }
        sendJson(res, 200, { ok: true })
        setTimeout(() => server.close(() => process.exit(0)), 50)
        return
      }

      if (getBearer(req.headers) !== config.apiKey) {
        return sendJson(res, 401, { error: { message: 'Invalid API key.' } })
      }

      if (req.method === 'GET' && url.pathname === '/v1/models') {
        return sendJson(res, 200, {
          object: 'list',
          data: toOpenAIModels(config)
        })
      }

      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const body = await readJsonBody(req)
        if (!Array.isArray(body.messages)) {
          return sendJson(res, 400, {
            error: { message: 'chat.completions request requires messages.' }
          })
        }

        const selected = resolveProviderAndModel(config, body.model)
        const responseModel = `${selected.provider.id}:${selected.modelId}`
        const upstreamBody = {
          ...body,
          model: selected.modelId
        }
        const upstream = await fetch(resolveOpenAIEndpoint(selected.provider, '/chat/completions'), {
          method: 'POST',
          headers: buildUpstreamHeaders(selected.provider, req.headers),
          body: JSON.stringify(upstreamBody)
        })

        res.setHeader?.('X-Agent-Qi-Model', responseModel)
        return await pipeUpstreamResponse(upstream, res)
      }

      return sendJson(res, 404, { error: { message: 'Not found.' } })
    } catch (error) {
      return sendJson(res, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      })
    }
  })

  server.listen(port, host)
}

export default async function runAgentQiOpenAIServerCommand(
  command: ServerCommand,
  runtime: RuntimeContext
) {
  if (command.action === 'stop') {
    return await stopServer(command.config)
  }

  if (command.action === 'health') {
    return await checkHealth(command.config)
  }

  if (command.action === 'start') {
    const serverConfig = buildServerConfig(command.config, command.providers)
    await startServer(serverConfig, runtime)
    return { ok: true, url: `${getBaseURL(serverConfig)}/v1` }
  }

  throw new Error(`Unsupported server command: ${(command as { action?: string }).action}`)
}
