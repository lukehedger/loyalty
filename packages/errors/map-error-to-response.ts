import { classifyError } from './classify-error.ts';
import type { ErrorBody } from './error-body.ts';

// Assignable to APIGatewayProxyResult, so a handler returns it as is.
export type ErrorResponse = {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

// Pass the request id as the errorId so a caller's report leads straight to the invocation's wide event.
export const mapErrorToResponse = (
  error: unknown,
  errorId: string,
): ErrorResponse => {
  const { statusCode, code, message } = classifyError(error);
  const body: ErrorBody = { errorId, code, message };

  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
};
