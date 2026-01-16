declare global {
  interface embedProviderOptions {
    input_type?: 'passage' | 'query'
  }

  type SplitType = 'text/markdown' | 'text' | 'code' | 'log'

  interface SplitOptions {
    type: SplitType
    chunkSize?: number
    chunkOverlap?: number
  }
}

export {}
