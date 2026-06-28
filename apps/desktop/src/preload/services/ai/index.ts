import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
type ClientConfig = Record<
  string,
  {
    command?: string
    args?: string[]
    url?: string
    transport?: 'http' | 'sse' | 'stdio'
    headers?: Record<string, string>
    active: boolean
    tools: Tools
    [key: string]: any
  }
>
type Tools = Awaited<ReturnType<MCPClient['tools']>>

interface ResourceInfo {
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
  serverName: string
}

interface ReadResourceResult {
  contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>
}

interface ResourceTemplateInfo {
  uriTemplate: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  serverName: string
}

interface aiServiceResult {
  list_tools: (config: ClientConfig, cache?: boolean) => Promise<Tools>
  list_mcp_resources: (config: ClientConfig, cache?: boolean) => Promise<ResourceInfo[]>
  read_mcp_resource: (config: ClientConfig, serverName: string, uri: string) => Promise<ReadResourceResult>
  list_mcp_resource_templates: (config: ClientConfig, cache?: boolean) => Promise<ResourceTemplateInfo[]>
}

export const aiServices = (): aiServiceResult => {
  let clientMap: Record<string, MCPClient> = {}
  let lastConfig: ClientConfig = {}
  let toolsCache: Tools | undefined
  const NEEDED_FIELDS = ['command', 'args', 'url', 'transport', 'headers'] as const

  const normalizeAbortSignal = (signal: any) => {
    if (!signal) return signal
    if (typeof signal.throwIfAborted === 'function') return signal

    return {
      ...signal,
      throwIfAborted() {
        if (signal.aborted) {
          throw signal.reason instanceof Error
            ? signal.reason
            : new DOMException('This operation was aborted', 'AbortError')
        }
      }
    }
  }

  const wrapMcpTools = (tools: Tools): Tools => {
    return Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [
        name,
        {
          ...tool,
          execute: async (input: any, options: any) => {
            return await tool.execute(input, {
              ...options,
              abortSignal: normalizeAbortSignal(options?.abortSignal)
            })
          }
        }
      ])
    ) as Tools
  }

  const extractNeededConfig = (cfg: any) => {
    const result: any = {}
    for (const key of NEEDED_FIELDS) result[key] = cfg?.[key]
    return result
  }

  const isNecessaryConfigChanged = (a: any, b: any) =>
    JSON.stringify(extractNeededConfig(a)) !== JSON.stringify(extractNeededConfig(b))

  const createTransport = (cfg: ClientConfig[keyof ClientConfig]) => {
    if (cfg.url) {
      if (cfg.transport === 'http')
        return new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined
        })
      if (cfg.transport === 'sse')
        return new SSEClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined
        })
    }
    if (cfg.command) {
      return new StdioClientTransport({
        command: cfg.command,
        args: cfg.args || []
      })
    }
    throw new Error('Invalid MCP config: missing url or command')
  }

  const syncClients = async (config: ClientConfig) => {
    for (const key of Object.keys(clientMap)) {
      if (!config[key]) {
        await clientMap[key].close()
        delete clientMap[key]
      }
    }
    for (const [key, serverCfg] of Object.entries(config)) {
      const prevCfg = lastConfig[key]
      if (!prevCfg || isNecessaryConfigChanged(prevCfg, serverCfg)) {
        if (clientMap[key]) {
          await clientMap[key].close()
        }
        clientMap[key] = await createMCPClient({
          transport: createTransport(serverCfg) as any
        })
      }
    }

    lastConfig = JSON.parse(JSON.stringify(config))
  }

  const list_tools = async (config: ClientConfig, cache = true) => {
    if (toolsCache && JSON.stringify(lastConfig) === JSON.stringify(config) && cache) {
      return toolsCache
    }

    await syncClients(config)

    const toolsList = (
      await Promise.allSettled(
        Object.values(clientMap).map(async (client) => wrapMcpTools(await client.tools()))
      )
    ).flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

    toolsCache = toolsList.reduce((acc, curr) => ({ ...acc, ...curr }), {})

    return toolsCache
  }

  let resourcesCache: ResourceInfo[] | undefined
  let templatesCache: ResourceTemplateInfo[] | undefined

  const list_mcp_resources = async (config: ClientConfig, cache = true) => {
    if (resourcesCache && JSON.stringify(lastConfig) === JSON.stringify(config) && cache) {
      return resourcesCache
    }

    await syncClients(config)

    const results = (
      await Promise.allSettled(
        Object.entries(clientMap).map(async ([serverName, client]) => {
          const { resources } = await client.listResources()
          return (resources || []).map((r) => ({
            uri: r.uri,
            name: r.name,
            title: r.title,
            description: r.description,
            mimeType: r.mimeType,
            size: r.size,
            serverName
          }))
        })
      )
    ).flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

    resourcesCache = results.flat()
    return resourcesCache
  }

  const read_mcp_resource = async (config: ClientConfig, serverName: string, uri: string) => {
    await syncClients(config)

    const client = clientMap[serverName]
    if (!client) {
      throw new Error(`MCP server "${serverName}" is not available.`)
    }

    const result = await client.readResource({ uri })
    return result as ReadResourceResult
  }

  const list_mcp_resource_templates = async (config: ClientConfig, cache = true) => {
    if (templatesCache && JSON.stringify(lastConfig) === JSON.stringify(config) && cache) {
      return templatesCache
    }

    await syncClients(config)

    const results = (
      await Promise.allSettled(
        Object.entries(clientMap).map(async ([serverName, client]) => {
          const { resourceTemplates } = await client.listResourceTemplates()
          return (resourceTemplates || []).map((t) => ({
            uriTemplate: t.uriTemplate,
            name: t.name,
            title: t.title,
            description: t.description,
            mimeType: t.mimeType,
            serverName
          }))
        })
      )
    ).flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

    templatesCache = results.flat()
    return templatesCache
  }

  return {
    list_tools,
    list_mcp_resources,
    read_mcp_resource,
    list_mcp_resource_templates
  }
}
