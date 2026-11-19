import { ValidationError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { earnPointsRequestSchema } from '@loyalty/schema';
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

export type EarnPointsDeps = {
  readonly router: CapabilityRouter<'earnPoints'>;
  readonly telemetry: Telemetry;
};

export const makeHandler =
  (deps: EarnPointsDeps): ApiHandler =>
  async (event, context) => {
    const request = earnPointsRequestSchema.safeParse(event);
    if (!request.success) {
      return respondToError(
        deps.telemetry,
        new ValidationError(request.error.issues),
        context.awsRequestId,
      );
    }
    recordAccountContext(deps.telemetry, {
      memberId: request.data.memberId,
      orderId: request.data.orderId,
    });

    // A replayed order earned before, so nothing new was created.
    return deps.router
      .invoke('direct', 'earnPoints', request.data)
      .then(({ outcome, balance }) =>
        respondWithBalance(outcome === 'approved' ? 201 : 200, balance),
      )
      .catch((error: unknown) =>
        respondToError(deps.telemetry, error, context.awsRequestId),
      );
  };

const telemetry = createRuntimeTelemetry();

export const handler: ApiHandler = instrument(
  telemetry,
  makeHandler({ router: createRuntimeRouter(), telemetry }),
);
