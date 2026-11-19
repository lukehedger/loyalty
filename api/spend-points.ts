import { ValidationError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { spendPointsRequestSchema } from '@loyalty/schema';
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

export type SpendPointsDeps = {
  readonly router: CapabilityRouter<'spendPoints'>;
  readonly telemetry: Telemetry;
};

export const makeHandler =
  (deps: SpendPointsDeps): ApiHandler =>
  async (event, context) => {
    const request = spendPointsRequestSchema.safeParse(event);
    if (!request.success) {
      return respondToError(
        deps.telemetry,
        new ValidationError(request.error.issues),
        context.awsRequestId,
      );
    }
    recordAccountContext(deps.telemetry, {
      memberId: request.data.memberId,
      spendId: request.data.spendId,
      rewardId: request.data.rewardId,
    });

    // A replayed spend was recorded before, so nothing new was created.
    return deps.router
      .invoke('direct', 'spendPoints', request.data)
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
