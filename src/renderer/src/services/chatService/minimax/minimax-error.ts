import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const miniMaxErrorDataSchema = z.object({
  base_resp: z.object({
    status_code: z.number(),
    status_msg: z.string(),
  }),
});

export type MiniMaxErrorData = z.infer<typeof miniMaxErrorDataSchema>;

export const miniMaxFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: miniMaxErrorDataSchema,
  errorToMessage: data => data.base_resp.status_msg,
});
