import { describe, it } from 'vitest'
import { cloneDeep } from 'es-toolkit'

const cloneMessagesForChat = (messages: BaseMessage[]): BaseMessage[] =>
  messages.map((msg) => ({
    ...msg,
    parts: msg.parts ? msg.parts.map((part) => ({ ...part })) : msg.parts,
    metadata: msg.metadata ? { ...msg.metadata } : msg.metadata
  }))

const buildMessages = (count: number): BaseMessage[] => {
  const messages: BaseMessage[] = []
  for (let i = 0; i < count; i += 1) {
    const isAssistant = i % 2 === 1
    messages.push({
      id: `msg-${i}`,
      role: isAssistant ? 'assistant' : 'user',
      parts: isAssistant
        ? [
            { type: 'text', text: '这是一段较长的回复文本'.repeat(50) },
            {
              type: 'tool-search_web',
              toolCallId: `call-${i}`,
              state: 'output-available',
              input: { query: '性能测试'.repeat(20) },
              output: { results: Array.from({ length: 10 }, (_, j) => ({ title: `结果${j}` })) }
            } as any,
            { type: 'text', text: '后续总结文本'.repeat(30) }
          ]
        : [{ type: 'text', text: '用户提问内容'.repeat(40) }],
      metadata: isAssistant
        ? {
            loading: false,
            provider: 'openai',
            model: 'gpt-4',
            date: Date.now(),
            cid: 'chat-1',
            estimatedInputTokens: 1200,
            usage: { inputTokens: 1200, outputTokens: 800, totalTokens: 2000 },
            stop: (() => {}) as any,
            ragSearchDetails: Array.from({ length: 5 }, (_, j) => ({
              knowledgeBaseId: `kb-${j}`,
              documentId: `doc-${j}`,
              score: 0.8
            }))
          }
        : undefined
    } as BaseMessage)
  }
  return messages
}

const measure = (fn: () => void, iterations: number) => {
  // warmup
  for (let i = 0; i < 5; i += 1) fn()
  const times: number[] = []
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const avg = times.reduce((s, t) => s + t, 0) / times.length
  const p50 = times[Math.floor(times.length * 0.5)]
  const p95 = times[Math.floor(times.length * 0.95)]
  return { avg, p50, p95 }
}

describe('message clone performance', () => {
  it('compares cloneDeep vs shallow clone across message counts', () => {
    const scenarios = [10, 20, 50, 100, 200]
    const iterations = 200
    const rows: Record<string, string>[] = []

    for (const count of scenarios) {
      const messages = buildMessages(count)
      const deep = measure(() => cloneDeep(messages), iterations)
      const shallow = measure(() => cloneMessagesForChat(messages), iterations)
      const speedup = (deep.avg / shallow.avg).toFixed(1)

      rows.push(
        {
          '消息数': String(count),
          'cloneDeep avg(ms)': deep.avg.toFixed(3),
          'shallow avg(ms)': shallow.avg.toFixed(3),
          '加速比': `${speedup}x`,
          'cloneDeep p95(ms)': deep.p95.toFixed(3),
          'shallow p95(ms)': shallow.p95.toFixed(3)
        }
      )
    }

    console.table(rows)
  })
})
