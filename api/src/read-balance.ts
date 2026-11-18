import { ValidationError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { readBalanceRequestSchema } from '@loyalty/schema';
import {
  type ApiHandler,
  instrument,
  type Telemetry,
} from '@loyalty/telemetry';
import {
  recordAccountContext,
  respondToError,
  respondWithBalance,
} from './respond.ts';
import { createRuntimeRouter, createRuntimeTelemetry } from './runtime.ts';

export type ReadBalanceDeps = {
  readonly router: CapabilityRouter<'readBalance'>;
  readonly telemetry: Telemetry;
};

export const makeHandler =
  (deps: ReadBalanceDeps): ApiHandler =>
  async (event, context) => {
    const request = readBalanceRequestSchema.safeParse(event);
    if (!request.success) {
      return respondToError(
        deps.telemetry,
        new ValidationError(request.error.issues),
        context.awsRequestId,
      );
    }
    recordAccountContext(deps.telemetry, { memberId: request.data.memberId });

    return deps.router
      .invoke('direct', 'readBalance', request.data)
      .then((balance) => respondWithBalance(200, balance))
      .catch((error: unknown) =>
        respondToError(deps.telemetry, error, context.awsRequestId),
      );
  };

const telemetry = createRuntimeTelemetry();

export const handler: ApiHandler = instrument(
  telemetry,
  makeHandler({ router: createRuntimeRouter(), telemetry }),
);
