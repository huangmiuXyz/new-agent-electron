export interface MiniMaxSpeechAPITypes {
  model: string;
  text: string;
  stream?: boolean;
  voice_setting?: {
    voice_id: string;
    speed?: number;
    vol?: number;
    pitch?: number;
    emotion?: string;
  };
  pronunciation_dict?: {
    tone?: string[];
  };
  audio_setting?: {
    sample_rate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav' | 'pcm' | 'flac';
    channel?: number;
  };
  subtitle_enable?: boolean;
}

export interface MiniMaxSpeechAPIResponse {
  data: {
    audio: string; // hex encoded audio
    status: number;
  };
  extra_info?: {
    audio_length: number;
    audio_sample_rate: number;
    audio_size: number;
    bitrate: number;
    word_count: number;
    invisible_character_ratio: number;
    usage_characters: number;
    audio_format: string;
    audio_channel: number;
  };
  trace_id: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}
