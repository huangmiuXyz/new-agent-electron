import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'

export const langChainServices = () => {
  const create_client = (config: ClientConfig) => {
    const client = new MultiServerMCPClient(config)
    return client
  }
  const list_tools = async (config: ClientConfig) => {
    const client = create_client(config)
    return await client.getTools()
  }
  return {
    create_client,
    list_tools
  }
}
