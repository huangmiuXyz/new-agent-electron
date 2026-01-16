export interface embedProviderOptions {
  input_type?: 'passage' | 'query'
}

export type SplitType = 'text/markdown' | 'text' | 'code' | 'log'

export interface SplitOptions {
  type: SplitType
  chunkSize?: number
  chunkOverlap?: number
}
