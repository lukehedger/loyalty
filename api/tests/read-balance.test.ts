import { describe, expect, test } from 'bun:test';
import { NotFoundError } from '@loyalty/errors';
import type { CapabilityRouter } from '@loyalty/router';
import { makeHandler } from '../read-balance.ts';
import {
  apiEvent,
  fakeTelemetry,
  jsonBody,
  lambdaContext,
} from './fixtures.ts';

type Router = CapabilityRouter<'readBalance'>;

const readEvent = apiEvent({
  pathParameters: { memberId: 'member-1' },
  body: null,
});

const handlerWith = (invoke: Router['invoke']) =>
  makeHandler({ router: { invoke }, telemetry: fakeTelemetry().telemetry });

describe('read balance handler', () => {
  test('answers with the balance of the account', async () => {
    const handler = handlerWith(async (_variant, _capability, request) => ({
      memberId: request.memberId,
      balance: 25,
    }));

    const response = await handler(readEvent, lambdaContext);

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response.body)).toEqual({
      memberId: 'member-1',
      balance: 25,
    });
  });

  test('answers a member with no account with 404', async () => {
    const handler = handlerWith(async () =>
      Promise.reject(new NotFoundError('Account not found')),
    );

    expect((await handler(readEvent, lambdaContext)).statusCode).toBe(404);
  });

  test('answers 500 when the response breaks its schema', async () => {
    const handler = handlerWith(async () => ({
      memberId: 'member-1',
      balance: -1,
    }));

    expect((await handler(readEvent, lambdaContext)).statusCode).toBe(500);
  });
});
