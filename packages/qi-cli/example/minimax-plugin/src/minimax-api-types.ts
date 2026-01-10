export interface MiniMaxGetVoiceReq {
  voice_type: 'all' | 'system' | 'cloning' | 'generation'
}

export interface MiniMaxGetVoiceResp {
  base_resp?: {
    status_code: number
    status_msg: string
  }
  system_voice?: Array<{
    voice_id: string
    voice_name?: string
  }>
  voice_cloning?: Array<{
    voice_id: string
  }>
  voice_generation?: Array<{
    voice_id: string
  }>
}
