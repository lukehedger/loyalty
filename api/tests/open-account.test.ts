import { describe, expect, test } from 'bun:test';
import { DecisionRejectedError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { makeHandler } from '../open-account.ts';
import {
  apiEvent,
  fakeTelemetry,
  jsonBody,
  lambdaContext,
} from './fixtures.ts';

type Router = CapabilityRouter<'openAccount'>;

const openEvent = (body: unknown) =>
  apiEvent({ pathParameters: null, body: JSON.stringify(body) });

const handlerWith = (invoke: Router['invoke']) =>
  makeHandler({ router: { invoke }, telemetry: fakeTelemetry().telemetry });

describe('open account handler', () => {
  test('answers an opened account with 201 and its balance', async () => {
    const handler = handlerWith(async (_variant, _capability, request) => ({
      outcome: 'approved',
      balance: { memberId: request.memberId, balance: 0 },
    }));

    const response = await handler(
      openEvent({ memberId: 'member-1' }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(201);
    expect(jsonBody(response.body)).toEqual({
      memberId: 'member-1',
      balance: 0,
    });
  });

  test('answers a second open with 422 and the invariant', async () => {
    const handler = handlerWith(async () =>
      Promise.reject(
        new DecisionRejectedError(
          'account_opens_once',
          'The member already has an account',
        ),
      ),
    );

    const response = await handler(
      openEvent({ memberId: 'member-1' }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(422);
    expect(jsonBody(response.body)).toMatchObject({
      code: 'account_opens_once',
    });
  });

  test('answers a malformed body with 400', async () => {
    const handler = handlerWith(async () => {
      throw new Error('The handler routed an invalid request');
    });

    const response = await handler(
      apiEvent({ pathParameters: null, body: '{' }),
      lambdaContext,
    );

    expect(response.statusCode).toBe(400);
  });
});
