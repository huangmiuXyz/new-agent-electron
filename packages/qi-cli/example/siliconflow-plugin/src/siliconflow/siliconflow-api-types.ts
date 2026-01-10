export interface SiliconFlowSpeechAPITypes {
  model: string;
  input: string;
  voice: string;
  response_format?: 'mp3' | 'wav' | 'pcm' | 'flac' | 'aac' | 'opus';
  sample_rate?: number;
  stream?: boolean;
  speed?: number;
  gain?: number;
}

export interface SiliconFlowModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface SiliconFlowGetModelsResp {
  data: SiliconFlowModel[];
}
