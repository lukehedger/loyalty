import { describe, expect, test } from 'bun:test';
import {
  ConflictError,
  DecisionRejectedError,
  NotFoundError,
} from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { makeHandler } from '../src/earn-points.ts';
import {
  apiEvent,
  fakeTelemetry,
  jsonBody,
  lambdaContext,
} from './fixtures.ts';

type Router = CapabilityRouter<'earnPoints'>;

const earnEvent = (body: unknown) =>
  apiEvent({
    pathParameters: { memberId: 'member-1' },
    body: JSON.stringify(body),
  });

const handlerWith = (invoke: Router['invoke']) => {
  const { keys, telemetry } = fakeTelemetry();
  const calls: Parameters<Router['invoke']>[] = [];
  const handler = makeHandler({
    router: {
      invoke: (...args) => {
        calls.push(args);
        return invoke(...args);
      },
    },
    telemetry,
  });

  return { calls, handler, keys };
};

const recorded =
  (outcome: 'approved' | 'replayed'): Router['invoke'] =>
  async () => ({ outcome, balance: { memberId: 'member-1', balance: 30 } });

describe('earn points handler', () => {
  test('routes the parsed request to the direct adapter', async () => {
    const { calls, handler, keys } = handlerWith(recorded('approved'));

    const response = await handler(
      earnEvent({ orderId: 'order-1', purchaseAmount: 1000 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(201);
    expect(jsonBody(response.body)).toEqual({
      memberId: 'member-1',
      balance: 30,
    });
    expect(calls).toEqual([
      [
        'direct',
        'earnPoints',
        { memberId: 'member-1', orderId: 'order-1', purchaseAmount: 1000 },
      ],
    ]);
    expect(keys.get('member_id')).toBe('member-1');
    expect(keys.get('order_id')).toBe('order-1');
  });

  test('answers a replayed order with 200', async () => {
    const { handler } = handlerWith(recorded('replayed'));

    const response = await handler(
      earnEvent({ orderId: 'order-1', purchaseAmount: 1000 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(200);
  });

  test('answers an oversized purchase amount with 400 and routes nothing', async () => {
    const { calls, handler, keys } = handlerWith(recorded('approved'));

    const response = await handler(
      earnEvent({ orderId: 'order-1', purchaseAmount: 10 ** 12 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(400);
    expect(jsonBody(response.body)).toEqual({
      errorId: 'request-1',
      code: 'ValidationError',
      message: 'Request failed validation',
    });
    expect(calls).toEqual([]);
    expect(keys.get('invalid_fields')).toBe('body.purchaseAmount');
  });

  test.each([
    [new DecisionRejectedError('points_need_an_account', 'No account'), 422],
    [new ConflictError('Retry the request'), 409],
    [new NotFoundError('Account not found'), 404],
  ])('maps %p to its status', async (error, statusCode) => {
    const { handler } = handlerWith(async () => Promise.reject(error));

    const response = await handler(
      earnEvent({ orderId: 'order-1', purchaseAmount: 1000 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(statusCode);
  });

  test('answers a fault with 500 and keeps its cause in the wide event', async () => {
    const { handler, keys } = handlerWith(async () =>
      Promise.reject(new Error('Balance is negative after the spend')),
    );

    const response = await handler(
      earnEvent({ orderId: 'order-1', purchaseAmount: 1000 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(500);
    expect(jsonBody(response.body)).toMatchObject({ code: 'InternalError' });
    expect(keys.get('error_code')).toBe('InternalError');
    expect(keys.get('error_message')).toBe(
      'Balance is negative after the spend',
    );
  });
});
