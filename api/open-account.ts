import { ValidationError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { openAccountRequestSchema } from '@loyalty/schema';
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

export type OpenAccountDeps = {
  readonly router: CapabilityRouter<'openAccount'>;
  readonly telemetry: Telemetry;
};

export const makeHandler =
  (deps: OpenAccountDeps): ApiHandler =>
  async (event, context) => {
    const request = openAccountRequestSchema.safeParse(event);
    if (!request.success) {
      return respondToError(
        deps.telemetry,
        new ValidationError(request.error.issues),
        context.awsRequestId,
      );
    }
    recordAccountContext(deps.telemetry, { memberId: request.data.memberId });

    return deps.router
      .invoke('direct', 'openAccount', request.data)
      .then(({ balance }) => respondWithBalance(201, balance))
      .catch((error: unknown) =>
        respondToError(deps.telemetry, error, context.awsRequestId),
      );
  };

const telemetry = createRuntimeTelemetry();

export const handler: ApiHandler = instrument(
  telemetry,
  makeHandler({ router: createRuntimeRouter(), telemetry }),
);
