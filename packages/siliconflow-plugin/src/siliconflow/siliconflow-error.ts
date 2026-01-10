import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const siliconFlowErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional(),
  }).optional(),
  message: z.string().optional(),
});

export type SiliconFlowErrorData = z.infer<typeof siliconFlowErrorDataSchema>;

export const siliconFlowFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: siliconFlowErrorDataSchema,
  errorToMessage: data => data.error?.message || data.message || 'Unknown error',
});
