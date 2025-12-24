import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn } from 'child_process'
import os from 'os'
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
      return new StreamableHTTPClientTransport(new URL(cfg.url), {
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

    const toolsList = await Promise.all(Object.values(clientMap).map((client) => client.tools()))

    toolsCache = toolsList.reduce((acc, curr) => ({ ...acc, ...curr }), {})

    return toolsCache
  }
  const startOllama = () => {
    const platform = os.platform()
    if (platform === 'darwin') {
      spawn('open', ['-a', 'Ollama'], {
        detached: true,
        stdio: 'ignore'
      })
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', 'Ollama'], {
        detached: true,
        stdio: 'ignore'
      })
    } else {
      spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore'
      })
    }
  }

  return {
    list_tools,
    startOllama
  }
}
