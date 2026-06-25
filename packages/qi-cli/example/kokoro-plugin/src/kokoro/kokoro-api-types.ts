export interface KokoroVoiceInfo {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  description?: string;
}

export interface KokoroErrorResponse {
  error: string;
  details?: string;
}
