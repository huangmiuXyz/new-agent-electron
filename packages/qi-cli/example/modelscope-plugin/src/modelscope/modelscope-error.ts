import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const modelScopeErrorDataSchema = z.object({
  errors: z.object({
    code: z.number(),
    message: z.string(),
  }).optional()
});

export type ModelScopeErrorData = z.infer<typeof modelScopeErrorDataSchema>;

export const modelScopeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: modelScopeErrorDataSchema,
  errorToMessage: data => data.errors?.message || 'Unknown error',
});
