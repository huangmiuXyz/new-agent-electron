export const useTemporaryChat = () => {
  const open = async ({
    model,
    agentId,
    agent,
    history,
    autoReply
  }: {
    model?: string
    agentId?: string
    agent?: any
    history?: any[]
    autoReply?: boolean
  }) => {
    await window.api.createTempChat({
      model,
      agentId,
      agent,
      history,
      autoReply: autoReply || false
    })
  }

  return {
    open
  }
}
