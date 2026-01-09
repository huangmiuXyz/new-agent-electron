export interface MiniMaxSpeechAPITypes {
  model: string;
  text: string;
  stream?: boolean;
  stream_options?: {
    exclude_aggregated_audio?: boolean;
  };
  voice_setting?: {
    voice_id: string;
    speed?: number;
    vol?: number;
    pitch?: number;
    emotion?: string;
    text_normalization?: boolean;
    latex_read?: boolean;
  };
  pronunciation_dict?: {
    tone?: string[];
  };
  audio_setting?: {
    sample_rate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav' | 'pcm' | 'flac';
    channel?: number;
    force_cbr?: boolean;
  };
  timber_weights?: {
    voice_id: string;
    weight: number;
  }[];
  language_boost?: string | null;
  voice_modify?: {
    pitch?: number;
    intensity?: number;
    timbre?: number;
    sound_effects?: string;
  };
  subtitle_enable?: boolean;
  output_format?: 'url' | 'hex';
  aigc_watermark?: boolean;
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

export interface MiniMaxGetVoiceReq {
  voice_type: 'system' | 'voice_cloning' | 'voice_generation' | 'all';
}

export interface VoiceInfo {
  voice_id: string;
  voice_name?: string;
  description: string[];
  created_time?: string;
}

export interface MiniMaxGetVoiceResp {
  system_voice?: VoiceInfo[];
  voice_cloning?: VoiceInfo[];
  voice_generation?: VoiceInfo[];
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}
