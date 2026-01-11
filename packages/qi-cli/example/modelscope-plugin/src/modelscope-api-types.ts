export interface ModelScopeImageGenerationRequest {
  model: string;
  prompt: string;
  negative_prompt?: string;
  size?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  image_url?: string;
  loras?: string | Record<string, number>;
}

export interface ModelScopeImageGenerationResponse {
  task_id: string;
}

export interface ModelScopeTaskResponse {
  task_id: string;
  task_status: 'PENDING' | 'RUNNING' | 'SUCCEED' | 'FAILED';
  output_images?: string[];
  message?: string;
}
