import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'

export const langChainServices = () => {
  const create_client = async (config: ClientConfig) => {
    const client = new MultiServerMCPClient(config)
    return client
  }
  const list_tools = async (config: ClientConfig) => {
    const client = await create_client(config)
    const tools = await client.getTools()
    return tools
  }
  return {
    create_client,
    list_tools
  }
}
