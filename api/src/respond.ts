import {
  classifyError,
  mapErrorToResponse,
  ValidationError,
} from '@loyalty/errors';
import { type BalanceResponse, balanceResponseSchema } from '@loyalty/schema';
import { createContextRecorder, type Telemetry } from '@loyalty/telemetry';
import type { APIGatewayProxyResult } from 'aws-lambda';

type AccountContext = {
  readonly memberId: string;
  readonly orderId: string;
  readonly spendId: string;
  readonly rewardId: string;
  readonly errorCode: string;
  readonly errorName: string;
  readonly errorMessage: string;
  readonly invalidFields: string;
};

export const recordAccountContext = createContextRecorder<AccountContext>({
  memberId: 'annotation',
  orderId: 'annotation',
  spendId: 'annotation',
  rewardId: 'log',
  errorCode: 'annotation',
  errorName: 'log',
  errorMessage: 'log',
  invalidFields: 'log',
});

// The response is parsed on its way out, like every request on its way in.
export const respondWithBalance = (
  statusCode: number,
  balance: BalanceResponse,
): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(balanceResponseSchema.parse(balance)),
});

// The wide event keeps what the response hides: the field paths of a bad request and the cause of a fault.
const describeError = (
  error: unknown,
  statusCode: number,
): Partial<AccountContext> => {
  if (error instanceof ValidationError) {
    return {
      invalidFields: error.issues
        .map((issue) => issue.path.map(String).join('.'))
        .join(','),
    };
  }
  if (statusCode < 500 || !(error instanceof Error)) return {};

  return { errorName: error.name, errorMessage: error.message };
};

export const respondToError = (
  telemetry: Telemetry,
  error: unknown,
  requestId: string,
): APIGatewayProxyResult => {
  const { statusCode, code } = classifyError(error);
  recordAccountContext(telemetry, {
    errorCode: code,
    ...describeError(error, statusCode),
  });

  return mapErrorToResponse(error, requestId);
};
