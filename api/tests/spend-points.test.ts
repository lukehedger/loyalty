import { describe, expect, test } from 'bun:test';
import { DecisionRejectedError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { makeHandler } from '../src/spend-points.ts';
import {
  apiEvent,
  fakeTelemetry,
  jsonBody,
  lambdaContext,
} from './fixtures.ts';

type Router = CapabilityRouter<'spendPoints'>;

const spendEvent = (body: unknown) =>
  apiEvent({
    pathParameters: { memberId: 'member-1' },
    body: JSON.stringify(body),
  });

const spend = { spendId: 'spend-1', rewardId: 'reward-1', points: 40 };

describe('spend points handler', () => {
  test('routes the parsed request and answers 201 for a new spend', async () => {
    const calls: Parameters<Router['invoke']>[] = [];
    const handler = makeHandler({
      router: {
        invoke: async (...args) => {
          calls.push(args);
          return {
            outcome: 'approved',
            balance: { memberId: 'member-1', balance: 60 },
          };
        },
      },
      telemetry: fakeTelemetry().telemetry,
    });

    const response = await handler(spendEvent(spend), lambdaContext);

    expect(response.statusCode).toBe(201);
    expect(jsonBody(response.body)).toEqual({
      memberId: 'member-1',
      balance: 60,
    });
    expect(calls).toEqual([
      ['direct', 'spendPoints', { memberId: 'member-1', ...spend }],
    ]);
  });

  test('answers a replayed spend with 200', async () => {
    const handler = makeHandler({
      router: {
        invoke: async () => ({
          outcome: 'replayed',
          balance: { memberId: 'member-1', balance: 60 },
        }),
      },
      telemetry: fakeTelemetry().telemetry,
    });

    expect((await handler(spendEvent(spend), lambdaContext)).statusCode).toBe(
      200,
    );
  });

  test('answers a spend beyond the balance with 422', async () => {
    const handler = makeHandler({
      router: {
        invoke: async () =>
          Promise.reject(
            new DecisionRejectedError(
              'balance_never_negative',
              'The spend is greater than the balance',
            ),
          ),
      },
      telemetry: fakeTelemetry().telemetry,
    });

    const response = await handler(spendEvent(spend), lambdaContext);

    expect(response.statusCode).toBe(422);
    expect(jsonBody(response.body)).toMatchObject({
      code: 'balance_never_negative',
    });
  });

  test('answers negative points with 400', async () => {
    const handler = makeHandler({
      router: {
        invoke: async () => {
          throw new Error('The handler routed an invalid request');
        },
      },
      telemetry: fakeTelemetry().telemetry,
    });

    const response = await handler(
      spendEvent({ ...spend, points: -1 }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(400);
  });
});
