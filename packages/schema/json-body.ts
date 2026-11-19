import { z } from 'zod';

// A malformed body becomes a validation issue, so a handler has one failure path for every bad request.
export const jsonBody = <T extends z.ZodType>(
  schema: T,
): z.ZodType<z.output<T>, string> =>
  z
    .string({ error: 'Request body is required' })
    .transform((body, context): unknown => {
      try {
        return JSON.parse(body);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Request body is not valid JSON',
        });
        return z.NEVER;
      }
    })
    .pipe(schema);
