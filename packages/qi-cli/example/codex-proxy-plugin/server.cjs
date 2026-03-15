const http = require('node:http')
const { URL } = require('node:url')
const { randomUUID } = require('node:crypto')

const HOST = process.env.CODEX_PROXY_PLUGIN_HOST || '127.0.0.1'
const PORT = Number(process.env.CODEX_PROXY_PLUGIN_PORT || 18123)
const normalizeReasoningEffort = (value) => {
  const normalized = String(value || 'high').trim()
  return normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'xhigh'
    ? normalized
    : 'high'
}

let runtimeConfig = {
  accessToken: String(process.env.CODEX_PROXY_PLUGIN_ACCESS_TOKEN || '').trim(),
  accountId: String(process.env.CODEX_PROXY_PLUGIN_ACCOUNT_ID || '').trim(),
  sessionCookie: String(process.env.CODEX_PROXY_PLUGIN_SESSION_COOKIE || '').trim(),
  defaultModel:
    String(process.env.CODEX_PROXY_PLUGIN_DEFAULT_MODEL || 'codex').trim() ||
    'codex',
  reasoningEffort: normalizeReasoningEffort(
    process.env.CODEX_PROXY_PLUGIN_REASONING_EFFORT || 'high'
  )
}

const getConfigHash = () =>
  JSON.stringify({
    accessToken: runtimeConfig.accessToken,
    accountId: runtimeConfig.accountId,
    sessionCookie: runtimeConfig.sessionCookie,
    defaultModel: runtimeConfig.defaultModel
  })

const resetRuntimeCaches = () => {
  modelsCache = {
    expiresAt: 0,
    data: null
  }
  usageCache = {
    expiresAt: 0,
    data: null
  }
}

const updateRuntimeConfig = (next) => {
  runtimeConfig = {
    ...runtimeConfig,
    accessToken: String(next?.accessToken || '').trim(),
    accountId: String(next?.accountId || '').trim(),
    sessionCookie: String(next?.sessionCookie || '').trim(),
    defaultModel: String(next?.defaultModel || 'codex').trim() || 'codex',
    reasoningEffort: normalizeReasoningEffort(next?.reasoningEffort || 'high')
  }
  resetRuntimeCaches()
}

const REASONING_EFFORT = (() => {
  const value = String(runtimeConfig.reasoningEffort || 'high').trim()
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' ? value : 'high'
})()
const API_KEY = String(process.env.CODEX_PROXY_PLUGIN_API_KEY || '').trim()
const UPSTREAM_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const CODEX_CLIENT_VERSION = '0.101.0'
const CODEX_USER_AGENT =
  'codex_cli_rs/0.101.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464'

const FALLBACK_MODEL_ENTRIES = [
  ['gpt-5.4', 'codex', 'latest flagship coding model'],
  ['gpt-5.3-codex', '', 'previous flagship agentic coding model'],
  ['gpt-5.3-codex-spark', '', 'ultra-light coding model'],
  ['gpt-5.2-codex', '', 'agentic coding model'],
  ['gpt-5.1-codex-max', 'codex-max', 'deep reasoning coding model'],
  ['gpt-5.1-codex-mini', 'codex-mini', 'lightweight fast coding model']
]

const MODEL_META = Object.fromEntries(
  FALLBACK_MODEL_ENTRIES.map(([id, alias, description]) => [
    id,
    { alias, description }
  ])
)

const defaultModels = () =>
  FALLBACK_MODEL_ENTRIES.map(([id, alias, description]) => ({
      id,
      name:
      id === runtimeConfig.defaultModel || alias === runtimeConfig.defaultModel
        ? `${alias || id} (default)`
        : alias || id,
    description,
    category: 'text',
    active: true,
    object: 'model',
    created: Date.now(),
    owned_by: 'codex-proxy'
  }))

let modelsCache = {
  expiresAt: 0,
  data: null
}

let usageCache = {
  expiresAt: 0,
  data: null
}

const buildUpstreamHeaders = (incomingHeaders, accept = 'text/event-stream') => {
  if (!runtimeConfig.accessToken) {
    throw new Error('Missing CODEX_PROXY_PLUGIN_ACCESS_TOKEN')
  }
  const { accessToken, sessionCookie } = runtimeConfig

  const accountId = resolveAccountId()
  if (!accountId) {
    throw new Error(
      'Missing ChatGPT account id and failed to derive it from the access token'
    )
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'ChatGPT-Account-Id': accountId,
    Accept: accept,
    'Content-Type': 'application/json',
    Originator: 'codex_cli_rs',
    Version: String(incomingHeaders.version || CODEX_CLIENT_VERSION),
    Session_id: String(incomingHeaders.session_id || randomUUID()),
    'User-Agent': String(incomingHeaders['user-agent'] || CODEX_USER_AGENT),
    Connection: 'keep-alive'
  }

  if (sessionCookie) {
    headers.Cookie = sessionCookie
  }

  return headers
}

const normalizeUpstreamModelList = (payload) => {
  const raw =
    payload?.data ||
    payload?.models ||
    payload?.items ||
    payload?.available_models ||
    payload?.model_list ||
    []
  if (!Array.isArray(raw)) return []

  const result = []
  for (const item of raw) {
    if (!item) continue
    const id = String(item.id || item.model || item.slug || '').trim()
    if (!id) continue
    const meta = MODEL_META[id] || {}
    const alias = meta.alias || ''
    const description = String(item.description || meta.description || '').trim()
    result.push({
      id,
      name:
        id === runtimeConfig.defaultModel || alias === runtimeConfig.defaultModel
          ? `${alias || item.name || id} (default)`
          : alias || String(item.name || id),
      description,
      category: 'text',
      active: true,
      object: 'model',
      created: Number(item.created || Date.now()),
      owned_by: String(item.owned_by || item.owner || 'codex-proxy')
    })
  }

  return result
}

const fetchModelsFromUpstream = async (incomingHeaders = {}) => {
  const now = Date.now()
  if (modelsCache.data && now < modelsCache.expiresAt) {
    return modelsCache.data
  }

  try {
    const response = await fetch(`${UPSTREAM_BASE_URL}/models`, {
      method: 'GET',
      headers: buildUpstreamHeaders(incomingHeaders, 'application/json')
    })
    if (!response.ok) {
      throw new Error(`models endpoint returned ${response.status}`)
    }
    const json = await response.json()
    const normalized = normalizeUpstreamModelList(json)
    if (normalized.length > 0) {
      modelsCache = {
        data: normalized,
        expiresAt: now + 60 * 1000
      }
      return normalized
    }
  } catch {
    // Ignore and fallback to built-in model list.
  }

  const fallback = defaultModels()
  modelsCache = {
    data: fallback,
    expiresAt: now + 30 * 1000
  }
  return fallback
}

const truncate = (value, max = 160) => {
  const text = String(value || '')
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

const resolveUsageUrls = () => {
  const candidates = [
    'https://chatgpt.com/backend-api/wham/usage',
    'https://chatgpt.com/wham/usage',
    'https://chatgpt.com/api/codex/usage'
  ]

  const deduped = []
  for (const url of candidates) {
    if (!deduped.includes(url)) deduped.push(url)
  }
  return deduped
}

const pickNearestWindow = (windows, targetSeconds) => {
  if (!Array.isArray(windows) || windows.length === 0) return null
  return windows.reduce((best, current) => {
    if (!current) return best
    if (!best) return current
    return Math.abs((current.limit_window_seconds || 0) - targetSeconds) <
      Math.abs((best.limit_window_seconds || 0) - targetSeconds)
      ? current
      : best
  }, null)
}

const toUsageWindow = (window) => {
  if (!window || typeof window !== 'object') return null
  return {
    usedPercent: Number(window.used_percent || 0) || 0,
    windowSeconds: Number(window.limit_window_seconds || 0) || 0,
    resetAt:
      window.reset_at === null || window.reset_at === undefined
        ? null
        : Number(window.reset_at || 0) || null
  }
}

const mapUsagePayload = (payload) => {
  const windows = []
  const pushWindow = (window) => {
    if (window && typeof window === 'object') windows.push(window)
  }

  pushWindow(payload?.rate_limit?.primary_window)
  pushWindow(payload?.rate_limit?.secondary_window)

  if (Array.isArray(payload?.additional_rate_limits)) {
    for (const limit of payload.additional_rate_limits) {
      pushWindow(limit?.rate_limit?.primary_window)
      pushWindow(limit?.rate_limit?.secondary_window)
    }
  }

  const fiveHour = toUsageWindow(pickNearestWindow(windows, 5 * 60 * 60))
  const oneWeek = toUsageWindow(pickNearestWindow(windows, 7 * 24 * 60 * 60))
  const credits = payload?.credits && typeof payload.credits === 'object'
    ? {
        hasCredits: Boolean(payload.credits.has_credits),
        unlimited: Boolean(payload.credits.unlimited),
        balance:
          payload.credits.balance === null || payload.credits.balance === undefined
            ? null
            : String(payload.credits.balance)
      }
    : null

  return {
    fetchedAt: Math.floor(Date.now() / 1000),
    planType:
      payload?.plan_type === null || payload?.plan_type === undefined
        ? null
        : String(payload.plan_type),
    fiveHour,
    oneWeek,
    credits
  }
}

const fetchUsageFromUpstream = async (incomingHeaders = {}) => {
  const now = Date.now()
  if (usageCache.data && now < usageCache.expiresAt) {
    return usageCache.data
  }

  const errors = []
  for (const usageUrl of resolveUsageUrls()) {
    try {
      const response = await fetch(usageUrl, {
        method: 'GET',
        headers: buildUpstreamHeaders(incomingHeaders, 'application/json')
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        errors.push(`${usageUrl} -> ${response.status}: ${truncate(body || response.statusText)}`)
        continue
      }

      const payload = await response.json()
      const normalized = mapUsagePayload(payload)
      usageCache = {
        data: normalized,
        expiresAt: now + 30 * 1000
      }
      return normalized
    } catch (error) {
      errors.push(
        `${usageUrl} -> ${truncate(error instanceof Error ? error.message : String(error))}`
      )
    }
  }

  throw new Error(`Codex usage endpoint failed: ${errors.slice(0, 2).join(' | ')}`)
}

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
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

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(payload))
}

const sendSseHead = (res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  })
}

const writeSse = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const unauthorized = (res) =>
  sendJson(res, 401, { error: { message: 'Invalid proxy api key.' } })

const invalidRequest = (res, message) =>
  sendJson(res, 400, {
    error: { message, type: 'invalid_request_error' }
  })

const gatewayError = (res, message) =>
  sendJson(res, 502, { error: { message } })

const getBearer = (headers) => {
  const raw = headers.authorization || headers.Authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(String(raw))
  return match ? match[1].trim() : ''
}

const isAuthorized = (req) => getBearer(req.headers) === API_KEY

const deriveAccountIdFromToken = (token) => {
  try {
    const parts = String(token).split('.')
    if (parts.length < 2) return ''
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    )
    const candidate =
      payload.account_id ||
      payload.chatgpt_account_id ||
      payload['https://api.openai.com/auth']?.account_id ||
      payload['https://api.openai.com/profile']?.account_id ||
      payload.sub
    return typeof candidate === 'string' ? candidate.trim() : ''
  } catch {
    return ''
  }
}

const resolveAccountId = () =>
  runtimeConfig.accountId || deriveAccountIdFromToken(runtimeConfig.accessToken)

const normalizeModelForUpstream = (model) => {
  const value = String(model || '').trim()
  if (!value || value === 'codex') return 'gpt-5.4'
  if (value === 'codex-max') return 'gpt-5.1-codex-max'
  if (value === 'codex-mini') return 'gpt-5.1-codex-mini'
  if (value === 'gpt-5-4') return 'gpt-5.4'
  return value
}

const normalizeModelForClient = (model) =>
  String(model || '').replace(/^gpt5\.4/, 'gpt-5.4')

const toContentByRole = (content, role = 'user') => {
  const textType = role === 'assistant' ? 'output_text' : 'input_text'

  if (typeof content === 'string') {
    return [{ type: textType, text: content }]
  }

  if (!Array.isArray(content)) {
    return [{ type: textType, text: String(content || '') }]
  }

  return content.flatMap((item) => {
    if (!item) return []
    if (typeof item === 'string') {
      return [{ type: textType, text: item }]
    }
    if (item.type === 'text') {
      return [{ type: textType, text: String(item.text || '') }]
    }
    if (role !== 'assistant' && item.type === 'image_url' && item.image_url?.url) {
      return [{ type: 'input_image', image_url: item.image_url.url }]
    }
    return []
  })
}

const convertMessagesToInput = (messages) => {
  const items = []

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue

    if (message.role === 'tool') {
      const callId = String(message.tool_call_id || message.toolCallId || '').trim()
      if (!callId) {
        continue
      }
      items.push({
        type: 'function_call_output',
        call_id: callId,
        output:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content || '')
      })
      continue
    }

    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      if (message.content) {
        items.push({
          type: 'message',
          role: 'assistant',
          content: toContentByRole(message.content, 'assistant')
        })
      }

      for (const toolCall of message.tool_calls) {
        items.push({
          type: 'function_call',
          call_id: toolCall.id || '',
          name: toolCall.function?.name || '',
          arguments: toolCall.function?.arguments || ''
        })
      }
      continue
    }

    items.push({
      type: 'message',
      role: message.role === 'system' ? 'developer' : message.role,
      content: toContentByRole(message.content, message.role)
    })
  }

  return items
}

const mapTools = (tools) =>
  Array.isArray(tools)
    ? tools
        .filter((tool) => tool?.type === 'function' && tool.function?.name)
        .map((tool) => ({
          type: 'function',
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters || {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }))
    : undefined

const convertChatRequest = (request) => {
  if (!Array.isArray(request.messages)) {
    throw new Error('chat.completions request requires messages')
  }

  const payload = {
    model: normalizeModelForUpstream(request.model),
    stream: true,
    store: false,
    instructions: '',
    input: convertMessagesToInput(request.messages),
    parallel_tool_calls: request.parallel_tool_calls !== false,
    include: ['reasoning.encrypted_content']
  }

  payload.reasoning = {
    effort:
      request.reasoningEffort ||
      request.reasoning_effort ||
      runtimeConfig.reasoningEffort ||
      REASONING_EFFORT,
    summary: 'auto'
  }

  const tools = mapTools(request.tools)
  if (tools?.length) {
    payload.tools = tools
  }

  if (request.tool_choice) {
    if (typeof request.tool_choice === 'string') {
      payload.tool_choice = request.tool_choice
    } else if (
      request.tool_choice.type === 'function' &&
      request.tool_choice.function?.name
    ) {
      payload.tool_choice = {
        type: 'function',
        name: request.tool_choice.function.name
      }
    }
  }

  return {
    payload,
    stream: Boolean(request.stream)
  }
}

const normalizeResponsesRequest = (request) => ({
  payload: (() => {
    const payload = {
      ...request,
      model: normalizeModelForUpstream(request.model),
      stream: true,
      store: false
    }

    if (!('instructions' in payload)) {
      payload.instructions = ''
    }
    if (!('parallel_tool_calls' in payload)) {
      payload.parallel_tool_calls = true
    }

    if (!payload.reasoning || typeof payload.reasoning !== 'object') {
      payload.reasoning = {}
    }
    if (!payload.reasoning.effort) {
      payload.reasoning.effort = 'medium'
    }
    if (!payload.reasoning.summary) {
      payload.reasoning.summary = 'auto'
    }

    const include = Array.isArray(payload.include) ? [...payload.include] : []
    if (!include.includes('reasoning.encrypted_content')) {
      include.push('reasoning.encrypted_content')
    }
    payload.include = include

    return payload
  })(),
  stream: Boolean(request.stream)
})

class SseDecoder {
  constructor() {
    this.buffer = ''
  }

  push(chunk) {
    this.buffer += chunk
    return this.takeReady()
  }

  finish() {
    const events = this.takeReady()
    if (this.buffer.trim()) {
      const parsed = parseSseBlock(this.buffer)
      if (parsed) events.push(parsed)
    }
    this.buffer = ''
    return events
  }

  takeReady() {
    const events = []

    while (true) {
      const lfIndex = this.buffer.indexOf('\n\n')
      const crlfIndex = this.buffer.indexOf('\r\n\r\n')
      let index = -1
      let separatorLength = 2

      if (lfIndex !== -1 && (crlfIndex === -1 || lfIndex < crlfIndex)) {
        index = lfIndex
        separatorLength = 2
      } else if (crlfIndex !== -1) {
        index = crlfIndex
        separatorLength = 4
      }

      if (index === -1) break

      const block = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + separatorLength)
      const parsed = parseSseBlock(block)
      if (parsed) events.push(parsed)
    }

    return events
  }
}

const parseSseBlock = (block) => {
  const lines = String(block).split(/\r?\n/)
  let event = ''
  const dataLines = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n') }
}

const buildUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return undefined
  return {
    prompt_tokens: usage.input_tokens || 0,
    completion_tokens: usage.output_tokens || 0,
    total_tokens: usage.total_tokens || 0
  }
}

const extractCompletedResponse = (events) => {
  for (const event of events) {
    if (!event?.data) continue
    try {
      const parsed = JSON.parse(event.data)
      if (parsed.type === 'response.completed') {
        return parsed.response || parsed
      }
    } catch {
      // noop
    }
  }

  throw new Error('response.completed event not found in upstream SSE')
}

const convertCompletedResponseToChat = (response) => {
  const output = Array.isArray(response.output) ? response.output : []
  const textParts = []
  const reasoningParts = []
  const toolCalls = []

  for (const item of output) {
    if (!item || typeof item !== 'object') continue

    if (item.type === 'reasoning' && Array.isArray(item.summary)) {
      for (const summary of item.summary) {
        if (summary?.type === 'summary_text' && summary.text) {
          reasoningParts.push(summary.text)
        }
      }
    }

    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content?.type === 'output_text' && content.text) {
          textParts.push(content.text)
        }
      }
    }

    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id || '',
        type: 'function',
        function: {
          name: item.name || '',
          arguments: item.arguments || ''
        }
      })
    }
  }

  return {
    id: response.id || `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created: response.created_at || Math.floor(Date.now() / 1000),
    model: normalizeModelForClient(response.model || 'gpt-5.4'),
    choices: [
      {
        index: 0,
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: textParts.join(''),
          ...(reasoningParts.length
            ? { reasoning_content: reasoningParts.join('\n\n') }
            : {}),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {})
        }
      }
    ],
    ...(buildUsage(response.usage) ? { usage: buildUsage(response.usage) } : {})
  }
}

const buildChatChunk = ({ id, created, model, delta, finishReason, usage }) => ({
  id,
  object: 'chat.completion.chunk',
  created,
  model: normalizeModelForClient(model),
  choices: [
    {
      index: 0,
      delta,
      finish_reason: finishReason || null,
      native_finish_reason: finishReason || null
    }
  ],
  ...(buildUsage(usage) ? { usage: buildUsage(usage) } : {})
})

const extractUpstreamErrorMessage = (parsed) => {
  const candidates = [
    parsed?.error?.message,
    parsed?.response?.error?.message,
    parsed?.message,
    parsed?.error,
    parsed?.response?.error
  ]

  for (const value of candidates) {
    if (!value) continue
    if (typeof value === 'string') return value
    if (typeof value === 'object' && typeof value.message === 'string') {
      return value.message
    }
  }

  return 'Codex upstream returned an error event.'
}

const forwardUpstream = async (payload, incomingHeaders) => {
  const response = await fetch(`${UPSTREAM_BASE_URL}/responses`, {
    method: 'POST',
    headers: buildUpstreamHeaders(incomingHeaders),
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Codex upstream ${response.status}: ${text || response.statusText}`
    )
  }

  return response
}

const rewriteSseJson = (json) => {
  if (!json || typeof json !== 'object') return json

  if (typeof json.model === 'string') {
    json.model = normalizeModelForClient(json.model)
  }

  if (
    json.response &&
    typeof json.response === 'object' &&
    typeof json.response.model === 'string'
  ) {
    json.response.model = normalizeModelForClient(json.response.model)
  }

  return json
}

const readAllEvents = async (response) => {
  const decoder = new SseDecoder()
  const events = []
  for await (const chunk of response.body) {
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString('utf8')
      : Buffer.from(chunk).toString('utf8')
    events.push(...decoder.push(text))
  }
  events.push(...decoder.finish())
  return events
}

const handleResponses = async (req, res) => {
  const body = await readJsonBody(req)
  const { payload, stream } = normalizeResponsesRequest(body)
  const upstream = await forwardUpstream(payload, req.headers)

  if (!stream) {
    const events = await readAllEvents(upstream)
    const completed = rewriteSseJson(extractCompletedResponse(events))
    return sendJson(res, 200, completed)
  }

  sendSseHead(res)
  const decoder = new SseDecoder()

  for await (const chunk of upstream.body) {
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString('utf8')
      : Buffer.from(chunk).toString('utf8')
    const events = decoder.push(text)

    for (const event of events) {
      if (!event?.data) continue
      if (event.data === '[DONE]') continue

      try {
        const parsed = rewriteSseJson(JSON.parse(event.data))
        res.write(`event: ${event.event || parsed.type || 'message'}\n`)
        res.write(`data: ${JSON.stringify(parsed)}\n\n`)
      } catch {
        res.write(`event: ${event.event || 'message'}\n`)
        res.write(`data: ${event.data}\n\n`)
      }
    }
  }

  for (const event of decoder.finish()) {
    if (!event?.data) continue
    try {
      const parsed = rewriteSseJson(JSON.parse(event.data))
      res.write(`event: ${event.event || parsed.type || 'message'}\n`)
      res.write(`data: ${JSON.stringify(parsed)}\n\n`)
    } catch {
      res.write(`event: ${event.event || 'message'}\n`)
      res.write(`data: ${event.data}\n\n`)
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
}

const handleChatCompletions = async (req, res) => {
  const body = await readJsonBody(req)
  const { payload, stream } = convertChatRequest(body)
  const upstream = await forwardUpstream(payload, req.headers)
  const created = Math.floor(Date.now() / 1000)
  const responseId = `chatcmpl_${randomUUID()}`

  if (!stream) {
    const events = await readAllEvents(upstream)
    return sendJson(
      res,
      200,
      convertCompletedResponseToChat(extractCompletedResponse(events))
    )
  }

  sendSseHead(res)
  const decoder = new SseDecoder()
  let functionCallIndex = -1
  let hasReceivedArgumentsDelta = false
  let hasToolCallAnnounced = false
  let terminated = false

  for await (const chunk of upstream.body) {
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString('utf8')
      : Buffer.from(chunk).toString('utf8')
    const events = decoder.push(text)

    for (const event of events) {
      if (!event?.data || event.data === '[DONE]') continue

      let parsed
      try {
        parsed = JSON.parse(event.data)
      } catch {
        continue
      }

      switch (parsed.type) {
        case 'response.failed':
        case 'error': {
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {
                role: 'assistant',
                content: `[Codex upstream error] ${extractUpstreamErrorMessage(parsed)}`
              },
              usage: parsed.response?.usage
            })
          )
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {},
              finishReason: 'stop',
              usage: parsed.response?.usage
            })
          )
          res.write('data: [DONE]\n\n')
          res.end()
          terminated = true
          break
        }
        case 'response.output_text.delta':
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: { role: 'assistant', content: parsed.delta || '' },
              usage: parsed.response?.usage
            })
          )
          break
        case 'response.reasoning_summary_text.delta':
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {
                role: 'assistant',
                reasoning_content: parsed.delta || ''
              },
              usage: parsed.response?.usage
            })
          )
          break
        case 'response.reasoning_summary_text.done':
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {
                role: 'assistant',
                reasoning_content: '\n\n'
              },
              usage: parsed.response?.usage
            })
          )
          break
        case 'response.output_item.added':
          if (parsed.item?.type === 'function_call') {
            functionCallIndex += 1
            hasReceivedArgumentsDelta = false
            hasToolCallAnnounced = true
            writeSse(
              res,
              buildChatChunk({
                id: responseId,
                created,
                model: parsed.response?.model || payload.model,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: functionCallIndex,
                      id: parsed.item.call_id || '',
                      type: 'function',
                      function: {
                        name: parsed.item.name || '',
                        arguments: ''
                      }
                    }
                  ]
                },
                usage: parsed.response?.usage
              })
            )
          }
          break
        case 'response.function_call_arguments.delta':
          hasReceivedArgumentsDelta = true
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {
                tool_calls: [
                  {
                    index: functionCallIndex,
                    function: {
                      arguments: parsed.delta || ''
                    }
                  }
                ]
              },
              usage: parsed.response?.usage
            })
          )
          break
        case 'response.function_call_arguments.done':
          if (!hasReceivedArgumentsDelta) {
            writeSse(
              res,
              buildChatChunk({
                id: responseId,
                created,
                model: parsed.response?.model || payload.model,
                delta: {
                  tool_calls: [
                    {
                      index: functionCallIndex,
                      function: {
                        arguments: parsed.arguments || ''
                      }
                    }
                  ]
                },
                usage: parsed.response?.usage
              })
            )
          }
          break
        case 'response.output_item.done':
          if (parsed.item?.type === 'function_call') {
            if (hasToolCallAnnounced) {
              hasToolCallAnnounced = false
              break
            }

            functionCallIndex += 1
            writeSse(
              res,
              buildChatChunk({
                id: responseId,
                created,
                model: parsed.response?.model || payload.model,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: functionCallIndex,
                      id: parsed.item.call_id || '',
                      type: 'function',
                      function: {
                        name: parsed.item.name || '',
                        arguments: parsed.item.arguments || ''
                      }
                    }
                  ]
                },
                usage: parsed.response?.usage
              })
            )
          }
          break
        case 'response.completed':
          writeSse(
            res,
            buildChatChunk({
              id: responseId,
              created,
              model: parsed.response?.model || payload.model,
              delta: {},
              finishReason: functionCallIndex >= 0 ? 'tool_calls' : 'stop',
              usage: parsed.response?.usage
            })
          )
          break
        default:
          break
      }

      if (terminated) break
    }

    if (terminated) break
  }

  if (terminated) return

  for (const event of decoder.finish()) {
    if (!event?.data || event.data === '[DONE]') continue
    let parsed
    try {
      parsed = JSON.parse(event.data)
    } catch {
      continue
    }

    if (parsed.type === 'response.completed') {
      writeSse(
        res,
        buildChatChunk({
          id: responseId,
          created,
          model: parsed.response?.model || payload.model,
          delta: {},
          finishReason: functionCallIndex >= 0 ? 'tool_calls' : 'stop',
          usage: parsed.response?.usage
        })
      )
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || `${HOST}:${PORT}`}`
    )

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, configHash: getConfigHash() })
    }

    if (req.method === 'POST' && url.pathname === '/config') {
      const body = await readJsonBody(req)
      if (body?.apiKey !== API_KEY) {
        return unauthorized(res)
      }
      updateRuntimeConfig(body)
      return sendJson(res, 200, { ok: true, configHash: getConfigHash() })
    }

    if (req.method === 'POST' && url.pathname === '/shutdown') {
      const body = await readJsonBody(req)
      if (body?.apiKey !== API_KEY) {
        return unauthorized(res)
      }
      sendJson(res, 200, { ok: true })
      setTimeout(() => server.close(), 50)
      return
    }

    if (!isAuthorized(req)) {
      return unauthorized(res)
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const models = await fetchModelsFromUpstream(req.headers)
      return sendJson(res, 200, {
        object: 'list',
        data: models
      })
    }

    if (req.method === 'GET' && url.pathname === '/codex/usage') {
      const usage = await fetchUsageFromUpstream(req.headers)
      return sendJson(res, 200, usage)
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      return await handleChatCompletions(req, res)
    }

    if (req.method === 'POST' && url.pathname === '/v1/responses') {
      return await handleResponses(req, res)
    }

    return sendJson(res, 404, {
      error: {
        message: `Unsupported route: ${req.method} ${url.pathname}`
      }
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return invalidRequest(res, `invalid JSON body: ${error.message}`)
    }
    return gatewayError(
      res,
      error instanceof Error ? error.message : String(error)
    )
  }
})

server.listen(PORT, HOST)
