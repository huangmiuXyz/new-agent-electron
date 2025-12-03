import { experimental_createMCPClient, type experimental_MCPClient as MCPClient } from '@ai-sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

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

interface aiServiceResult {
  list_tools: (config: ClientConfig, cache?: boolean) => Promise<Tools>
}
export const aiServices = (): aiServiceResult => {
  let clients: MCPClient[] = []
  let lastConfig: ClientConfig
  let tools: Tools

  const isConfigChanged = (a?: ClientConfig, b?: ClientConfig) => {
    return JSON.stringify(a) !== JSON.stringify(b)
  }

  const createTransport = (cfg: ClientConfig[keyof ClientConfig]) => {
    if (cfg.url) {
      return {
        type: cfg.transport || 'sse',
        url: cfg.url,
        headers: cfg.headers
      }
    }
    if (cfg.command) {
      return new StdioClientTransport({
        command: cfg.command,
        args: cfg.args || []
      })
    }
    throw new Error('Invalid MCP config: missing url or command')
  }

  const create_clients = async (config: ClientConfig) => {
    if (clients.length > 0 && isConfigChanged(lastConfig, config)) {
      await Promise.all(clients.map((c) => c.close()))
      clients = []
      tools = undefined as any
    }
    if ((!clients || clients.length === 0) && config) {
      const promises = Object.values(config).map(async (serverConfig) => {
        return await experimental_createMCPClient({
          transport: createTransport(serverConfig) as any
        })
      })
      clients = await Promise.all(promises)
      lastConfig = config
    }
    return clients
  }

  const list_tools = async (config: ClientConfig, cache: boolean = true) => {
    if (tools && !isConfigChanged(lastConfig, config) && cache) {
      return tools
    }

    if (!clients || clients.length === 0 || isConfigChanged(lastConfig, config)) {
      await create_clients(config)
    }

    const toolsList = await Promise.all(clients.map((client) => client.tools()))

    tools = toolsList.reduce((acc, curr) => ({ ...acc, ...curr }), {})

    return tools
  }

  return {
    list_tools
  }
}
