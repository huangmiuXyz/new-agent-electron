import { z } from 'zod';

export const comfyImageCallOptionsSchema = z.object({
  workflowJson: z
    .string()
    .optional()
    .describe('ComfyUI API workflow JSON. Supports ${prompt} and ${seed} placeholders.')
});

export type ComfyImageCallOptions = z.infer<typeof comfyImageCallOptionsSchema>;

export interface ComfyPromptResponse {
  prompt_id?: string | number;
  number?: number;
  node_errors?: Record<string, unknown>;
  error?: string;
}

export interface ComfyHistoryImageOutput {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface ComfyHistoryNodeOutput {
  images?: ComfyHistoryImageOutput[];
}

export interface ComfyExecutionMessage {
  type?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ComfyHistoryStatus {
  status_str?: string;
  completed?: boolean;
  messages?: ComfyExecutionMessage[];
}

export interface ComfyHistoryEntry {
  outputs?: Record<string, ComfyHistoryNodeOutput>;
  status?: ComfyHistoryStatus;
}

export interface ComfyPollResult {
  status: 'pending' | 'completed' | 'failed';
  images?: string[];
  error?: string;
}
