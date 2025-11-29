import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'

type Tools = Awaited<ReturnType<MultiServerMCPClient['getTools']>>
export const langChainServices = () => {
  let client: MultiServerMCPClient
  let lastConfig: ClientConfig
  let tools: Tools
  const isConfigChanged = (a?: ClientConfig, b?: ClientConfig) => {
    return JSON.stringify(a) !== JSON.stringify(b)
  }

  const create_client = async (config: ClientConfig) => {
    if (!client || isConfigChanged(lastConfig, config)) {
      client = new MultiServerMCPClient(config)
      lastConfig = config
    }
    return client
  }

  const list_tools = async (config: ClientConfig, cache: boolean = true) => {
    if (tools && !isConfigChanged(lastConfig, config) && cache) {
      return tools
    }
    if (!client) {
      await create_client(config)
    }
    tools = await client.getTools()
    return tools
  }

  return {
    list_tools
  }
}
