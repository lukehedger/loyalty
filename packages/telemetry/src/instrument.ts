import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { type Outcome, recordContext, resetTelemetry } from './context.ts';
import { openCalls, trackOpenCalls } from './open-calls.ts';
import type { Telemetry } from './telemetry.ts';

export type ApiHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

export type InstrumentOptions = {
  // Lambda kills a timed-out invocation before the wide event, so write it this long before the timeout.
  readonly deadlineMarginMs?: number;
};

// Only the identity the Cognito authorizer asserted, so a caller cannot choose the client it is logged as.
const authorisedClientId = (
  event: APIGatewayProxyEvent,
): string | undefined => {
  const claim: unknown = event.requestContext.authorizer?.claims?.client_id;

  return typeof claim === 'string' ? claim : undefined;
};

const TIMEOUT_PATTERN =
  /\b(timeout|timed out|etimedout|econnaborted|socket hang up|abort(ed)?)\b/i;

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  if (TIMEOUT_PATTERN.test(error.message)) return true;

  return isTimeoutError(error.cause);
};

// Handlers map known errors to responses, so the status is the outcome and a throw is a fault.
const outcomeOfStatus = (statusCode: number): Outcome => {
  if (statusCode === 504) return 'timeout';
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'client_error';

  return 'success';
};

const outcomeOfError = (error: unknown): Outcome =>
  isTimeoutError(error) ? 'timeout' : 'server_error';

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Handler threw a non-Error value');

// Settling reports whether the deadline already wrote the wide event, so the caller writes at most one.
const scheduleDeadlineEvent = (
  telemetry: Telemetry,
  context: Context,
  marginMs: number | undefined,
): (() => boolean) => {
  if (marginMs === undefined) return () => false;

  let written = false;
  const timer = setTimeout(() => {
    written = true;
    recordContext(telemetry, { outcome: 'timeout' });
    telemetry.logger.appendKeys({ open_calls: openCalls() });
    telemetry.logger.error(
      'invocation',
      new Error('Invocation reached its deadline'),
    );
  }, context.getRemainingTimeInMillis() - marginMs);

  return () => {
    clearTimeout(timer);
    return written;
  };
};

export const instrument = (
  telemetry: Telemetry,
  handler: ApiHandler,
  options: InstrumentOptions = {},
): ApiHandler => {
  if (options.deadlineMarginMs !== undefined) trackOpenCalls();

  return async (event, context) => {
    const { logger, metrics, tracer } = telemetry;
    resetTelemetry(telemetry);
    const settleDeadline = scheduleDeadlineEvent(
      telemetry,
      context,
      options.deadlineMarginMs,
    );

    try {
      // Annotations land only inside the subsegment, so every record happens within it.
      const response = await tracer.trace('handler', async () => {
        tracer.annotateColdStart();
        recordContext(telemetry, {
          route: `${event.httpMethod} ${event.resource}`,
          requestId: context.awsRequestId,
          clientId: authorisedClientId(event),
        });

        const result = await handler(event, context).catch((error: unknown) => {
          recordContext(telemetry, { outcome: outcomeOfError(error) });
          throw error;
        });
        recordContext(telemetry, {
          statusCode: result.statusCode,
          outcome: outcomeOfStatus(result.statusCode),
        });

        return result;
      });

      // The deadline event is this invocation's wide event, so a late return writes no second one.
      if (!settleDeadline()) logger.info('invocation');

      return response;
    } catch (error: unknown) {
      if (!settleDeadline()) logger.error('invocation', asError(error));

      throw error;
    } finally {
      metrics.flush();
    }
  };
};
