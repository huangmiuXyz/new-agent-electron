export * from '@agent-qi/types/ai'

declare global {
  type ModelCategory = 'text' | 'embedding' | 'image' | 'video' | 'rerank' | 'speech' | 'tts'
}

export {}
