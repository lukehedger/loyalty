import { describe, expect, test } from 'bun:test';
import {
  createContextRecorder,
  recordContext,
  resetTelemetry,
} from '../index.ts';
import { fakeTelemetry } from './fake-telemetry.ts';

type OrderContext = {
  readonly orderId: string;
  readonly channel: 'web' | 'store';
  readonly total: number;
  readonly partnerReference: string;
};

const recordOrderContext = createContextRecorder<OrderContext>({
  orderId: 'annotation',
  channel: 'dimension',
  total: 'metadata',
  partnerReference: 'log',
});

describe('recordContext', () => {
  test('writes every request key to the wide event in snake case', async () => {
    const fake = fakeTelemetry();

    await fake.inTrace(() =>
      recordContext(fake.telemetry, {
        route: 'POST /orders',
        outcome: 'success',
        statusCode: 201,
        requestId: 'request-1',
        clientId: 'client-1',
      }),
    );

    expect(Object.fromEntries(fake.keys)).toEqual({
      route: 'POST /orders',
      outcome: 'success',
      status_code: 201,
      request_id: 'request-1',
      client_id: 'client-1',
    });
  });

  test('dimensions only the low-cardinality request keys', async () => {
    const fake = fakeTelemetry();

    await fake.inTrace(() =>
      recordContext(fake.telemetry, {
        route: 'POST /orders',
        outcome: 'success',
        statusCode: 201,
        requestId: 'request-1',
        clientId: 'client-1',
      }),
    );

    expect(fake.dimensionSets).toEqual([
      { route: 'POST /orders', outcome: 'success' },
    ]);
    expect(Object.fromEntries(fake.annotations)).toEqual({
      route: 'POST /orders',
      outcome: 'success',
      status_code: 201,
      client_id: 'client-1',
    });
  });

  test('omits an undefined value rather than logging it', () => {
    const fake = fakeTelemetry();

    recordContext(fake.telemetry, {
      route: 'GET /orders',
      clientId: undefined,
    });

    expect(Object.fromEntries(fake.keys)).toEqual({ route: 'GET /orders' });
  });

  test('records nothing for an empty context', () => {
    const fake = fakeTelemetry();

    recordContext(fake.telemetry, {});

    expect(fake.keys.size).toBe(0);
    expect(fake.dimensionSets).toEqual([]);
  });

  test('a later value for a key replaces the earlier one on the wide event', () => {
    const fake = fakeTelemetry();

    recordContext(fake.telemetry, { outcome: 'success' });
    recordContext(fake.telemetry, { outcome: 'server_error' });

    expect(fake.keys.get('outcome')).toBe('server_error');
  });
});

describe('createContextRecorder', () => {
  test('routes each app key by the kind it declares', async () => {
    const fake = fakeTelemetry();

    await fake.inTrace(() =>
      recordOrderContext(fake.telemetry, {
        orderId: 'order-1',
        channel: 'web',
        total: 4999,
        partnerReference: 'partner-1',
      }),
    );

    expect(Object.fromEntries(fake.keys)).toEqual({
      order_id: 'order-1',
      channel: 'web',
      total: 4999,
      partner_reference: 'partner-1',
    });
    expect(Object.fromEntries(fake.annotations)).toEqual({
      order_id: 'order-1',
      channel: 'web',
    });
    expect(Object.fromEntries(fake.metadata)).toEqual({ total: 4999 });
    expect(fake.dimensionSets).toEqual([{ channel: 'web' }]);
  });

  test('records request keys alongside app keys', () => {
    const fake = fakeTelemetry();

    recordOrderContext(fake.telemetry, {
      outcome: 'client_error',
      orderId: 'order-1',
    });

    expect(Object.fromEntries(fake.keys)).toEqual({
      outcome: 'client_error',
      order_id: 'order-1',
    });
  });

  test('an app context cannot redefine a request key', () => {
    // @ts-expect-error `route` belongs to the request context.
    createContextRecorder<{ readonly route: string }>({ route: 'log' });
  });
});

describe('resetTelemetry', () => {
  test('clears the keys and dimensions a previous invocation recorded', () => {
    const fake = fakeTelemetry();
    recordContext(fake.telemetry, { route: 'POST /orders' });

    resetTelemetry(fake.telemetry);

    expect(fake.keys.size).toBe(0);
    expect(fake.dimensionSets).toEqual([]);
  });
});
