import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'

export const langChainServices = () => {
  let client: MultiServerMCPClient
  let lastConfig: ClientConfig

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

  const list_tools = async (config: ClientConfig) => {
    if (!client) {
      await create_client(config)
    }
    return await client.getTools()
  }

  return {
    list_tools
  }
}
