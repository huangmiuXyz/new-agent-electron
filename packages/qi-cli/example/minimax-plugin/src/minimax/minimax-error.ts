import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const miniMaxErrorDataSchema = z.object({
  trace_id: z.string().optional(),
  base_resp: z.object({
    status_code: z.number(),
    status_msg: z.string(),
  }),
});

export type MiniMaxErrorData = z.infer<typeof miniMaxErrorDataSchema>;

export const formatMiniMaxError = (data: MiniMaxErrorData) => {
  const statusMsg = data.base_resp?.status_msg || 'unknown error'
  const statusCode = data.base_resp?.status_code
  const traceId = data.trace_id

  return [
    `MiniMax API Error: ${statusMsg}`,
    typeof statusCode === 'number' ? `(${statusCode})` : '',
    traceId ? `[trace_id: ${traceId}]` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export const miniMaxFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: miniMaxErrorDataSchema,
  errorToMessage: formatMiniMaxError,
});
