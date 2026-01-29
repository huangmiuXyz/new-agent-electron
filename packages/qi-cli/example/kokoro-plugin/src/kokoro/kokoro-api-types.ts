export interface KokoroSpeechRequest {
  text: string;
  voice: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'pcm';
  lang?: 'zh' | 'en' | 'auto';
}

export interface KokoroSpeechResponse {
  audio: string; // base64 encoded audio
  sampleRate: number;
  format: string;
  duration?: number;
}

export interface KokoroVoiceInfo {
  id: string;
  name: string;
  language: 'zh' | 'en' | 'mixed';
  gender?: 'male' | 'female';
  description?: string;
}

export interface KokoroListVoicesResponse {
  voices: KokoroVoiceInfo[];
}

export interface KokoroErrorResponse {
  error: string;
  details?: string;
}
