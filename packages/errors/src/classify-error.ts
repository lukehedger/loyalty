import {
  CapabilityNotSupportedError,
  DecisionRejectedError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from './errors.ts';

export type ErrorOutcome = 'client_error' | 'server_error' | 'timeout';

export type ErrorClassification = {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly outcome: ErrorOutcome;
};

// The single source of truth for the error taxonomy. Every public message is safe to return to the caller.
export const classifyError = (error: unknown): ErrorClassification => {
  // The issues stay on the error for the wide event. Returning them would tell a caller the expected request format.
  if (error instanceof ValidationError) {
    return publicError(error, 400, 'ValidationError', error.message);
  }

  if (error instanceof NotFoundError) {
    return publicError(error, 404, 'NotFound', error.message);
  }

  if (error instanceof CapabilityNotSupportedError) {
    return publicError(error, 422, 'CapabilityNotSupported', error.message);
  }

  if (error instanceof DecisionRejectedError) {
    return publicError(error, 422, error.code, error.message);
  }

  if (error instanceof IntegrationError) {
    return publicError(
      error,
      502,
      'IntegrationFailure',
      'Upstream request failed',
    );
  }

  return publicError(error, 500, 'InternalError', 'Unexpected error');
};

const publicError = (
  error: unknown,
  statusCode: number,
  code: string,
  message: string,
): ErrorClassification => ({
  statusCode,
  code,
  message,
  outcome: outcomeOf(error, statusCode),
});

const outcomeOf = (error: unknown, statusCode: number): ErrorOutcome => {
  if (isTimeout(error)) return 'timeout';
  return statusCode < 500 ? 'client_error' : 'server_error';
};

const isTimeout = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;

  return isTimeout(error.cause);
};
