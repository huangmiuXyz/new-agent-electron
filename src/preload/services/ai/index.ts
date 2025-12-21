import { experimental_createMCPClient, type experimental_MCPClient as MCPClient } from '@ai-sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawn } from 'child_process'

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
  startOllama: () => void
}

export const aiServices = (): aiServiceResult => {
  let clientMap: Record<string, MCPClient> = {}
  let lastConfig: ClientConfig = {}
  let toolsCache: Tools | undefined
  const NEEDED_FIELDS = ['command', 'args', 'url', 'transport', 'headers'] as const
  const extractNeededConfig = (cfg: any) => {
    const result: any = {}
    for (const key of NEEDED_FIELDS) result[key] = cfg?.[key]
    return result
  }

  const isNecessaryConfigChanged = (a: any, b: any) =>
    JSON.stringify(extractNeededConfig(a)) !== JSON.stringify(extractNeededConfig(b))

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
        clientMap[key] = await experimental_createMCPClient({
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

    const toolsList = await Promise.all(Object.values(clientMap).map((client) => client.tools()))

    toolsCache = toolsList.reduce((acc, curr) => ({ ...acc, ...curr }), {})

    return toolsCache
  }

  const startOllama = () => {
    const cp = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    })

    cp.unref()
  }
  return {
    list_tools,
    startOllama
  }
}
