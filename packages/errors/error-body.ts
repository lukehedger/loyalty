import { z } from 'zod';

export const errorBodySchema = z.strictObject({
  errorId: z.string(),
  code: z.string(),
  message: z.string(),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
