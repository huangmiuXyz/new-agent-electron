export const onUseAIBefore = async ({
  model,
  providerType,
  apiKey,
  baseURL
}: {
  model?: string
  providerType: providerType
  apiKey: string
  baseURL: string
}) => {
  console.log('onUseAIBefore', model, providerType, apiKey, baseURL);
  if (providerType === 'ollama') {
    const url = baseURL
    const isRunning = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${url}/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(1500)
        })
        return res.ok
      } catch {
        return false
      }
    }

    const waitUntilRunning = async (timeoutMs = 10_000, intervalMs = 500): Promise<boolean> => {
      const start = Date.now()

      while (Date.now() - start < timeoutMs) {
        if (await isRunning()) {
          return true
        }
        await new Promise((r) => setTimeout(r, intervalMs))
      }

      return false
    }
    try {
      await execPromise('ollama --version')
    } catch {
      useModal().confirm({
        title: '未检测到 Ollama，请先安装。',
        content: '是否让智能体帮助您安装？',
        onOk: () => {
          useTemporaryChat().open({
            agent: {
              id: 'ollama-installer',
              name: 'Ollama 安装助手',
              description: '协助安装和配置 Ollama',
              systemPrompt:
                '你是一个专门帮助用户安装和配置 Ollama 的助手。请指导用户完成安装过程。',
              mcpServers: [],
              tools: [],
              builtinTools: ['exec_command'],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              knowledgeBaseIds: []
            },
            history: [
              {
                role: 'user',
                content: '我没有检测到 Ollama，请帮我安装。',
                id: 'init-msg',
                parts: [{ type: 'text', text: '我没有检测到 Ollama，请帮我安装。' }]
              }
            ],
            autoReply: true
          })
        }
      })
      throw new Error('ollama not installed')
    }
    if (!(await isRunning())) {
      window.api.startOllama()
      messageApi.info('自动启动ollama。')

      const ok = await waitUntilRunning(10_000, 500)
      if (!ok) {
        throw new Error('ollama start timeout')
      }
    }
  }
}
