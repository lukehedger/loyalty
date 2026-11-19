import { afterEach, describe, expect, test } from 'bun:test';
import { channel } from 'node:diagnostics_channel';
import {
  type ClientRequest,
  createServer,
  request,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { instrument } from '../index.ts';
import { fakeTelemetry } from './fake-telemetry.ts';

const apiEvent = (
  overrides: {
    readonly claims?: Readonly<Record<string, unknown>>;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): APIGatewayProxyEvent => ({
  resource: '/orders/{id}',
  path: '/orders/order-1',
  httpMethod: 'POST',
  body: '{}',
  headers: { ...overrides.headers },
  multiValueHeaders: {},
  isBase64Encoded: false,
  pathParameters: { id: 'order-1' },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'api',
    authorizer: { claims: overrides.claims ?? { client_id: 'client-1' } },
    protocol: 'HTTP/1.1',
    httpMethod: 'POST',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: null,
      userArn: null,
    },
    path: '/orders/order-1',
    stage: 'test',
    requestId: 'gateway-request-1',
    requestTimeEpoch: 1_700_000_000_000,
    resourceId: 'resource',
    resourcePath: '/orders/{id}',
  },
});

const lambdaContext = (remainingMs = 30_000): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'orders',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123456789012:function:orders',
  memoryLimitInMB: '1024',
  awsRequestId: 'lambda-request-1',
  logGroupName: '/aws/lambda/orders',
  logStreamName: 'stream',
  getRemainingTimeInMillis: () => remainingMs,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

const respond =
  (statusCode: number) => async (): Promise<APIGatewayProxyResult> => ({
    statusCode,
    body: '{}',
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const neverReturns = (): Promise<never> => new Promise<never>(() => {});

describe('instrument', () => {
  test('emits one info wide event carrying the request context', async () => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(200))(apiEvent(), lambdaContext());

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]).toMatchObject({
      level: 'info',
      message: 'invocation',
      keys: {
        route: 'POST /orders/{id}',
        request_id: 'lambda-request-1',
        client_id: 'client-1',
        status_code: 200,
        outcome: 'success',
      },
    });
  });

  test.each([
    [201, 'success'],
    [302, 'success'],
    [404, 'client_error'],
    [422, 'client_error'],
    [500, 'server_error'],
    [502, 'server_error'],
    [504, 'timeout'],
  ])('classifies a %i response as %s', async (statusCode, outcome) => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(statusCode))(
      apiEvent(),
      lambdaContext(),
    );

    expect(fake.events[0]?.keys.outcome).toBe(outcome);
  });

  test('annotates the trace inside the handler subsegment', async () => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(201))(apiEvent(), lambdaContext());

    expect(Object.fromEntries(fake.annotations)).toEqual({
      route: 'POST /orders/{id}',
      client_id: 'client-1',
      status_code: 201,
      outcome: 'success',
    });
  });

  test('keeps keys the handler recorded on the wide event', async () => {
    const fake = fakeTelemetry();
    const handler = async (): Promise<APIGatewayProxyResult> => {
      fake.telemetry.logger.appendKeys({ order_id: 'order-1' });
      return { statusCode: 200, body: '{}' };
    };

    await instrument(fake.telemetry, handler)(apiEvent(), lambdaContext());

    expect(fake.events[0]?.keys.order_id).toBe('order-1');
  });

  test('a throwing handler emits an error wide event and rethrows', async () => {
    const fake = fakeTelemetry();
    const failure = new Error('Order store unavailable');
    const handler = async (): Promise<APIGatewayProxyResult> => {
      throw failure;
    };

    await expect(
      instrument(fake.telemetry, handler)(apiEvent(), lambdaContext()),
    ).rejects.toBe(failure);

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]).toMatchObject({
      level: 'error',
      message: 'invocation',
      error: failure,
      keys: { outcome: 'server_error' },
    });
  });

  test('classifies a thrown timeout, including one wrapped as a cause, as timeout', async () => {
    const fake = fakeTelemetry();
    const handler = async (): Promise<APIGatewayProxyResult> => {
      throw new Error('Partner call failed', {
        cause: new DOMException('The operation was aborted', 'AbortError'),
      });
    };

    await instrument(fake.telemetry, handler)(
      apiEvent(),
      lambdaContext(),
    ).catch(() => {});

    expect(fake.events[0]?.keys.outcome).toBe('timeout');
  });

  test('flushes metrics whether the handler returns or throws', async () => {
    const fake = fakeTelemetry();
    const failing = async (): Promise<APIGatewayProxyResult> => {
      throw new Error('Order store unavailable');
    };

    await instrument(fake.telemetry, respond(200))(apiEvent(), lambdaContext());
    await instrument(fake.telemetry, failing)(
      apiEvent(),
      lambdaContext(),
    ).catch(() => {});

    expect(fake.flushes()).toBe(2);
  });

  test('resets keys a previous invocation left in a warm container', async () => {
    const fake = fakeTelemetry();
    fake.telemetry.logger.appendKeys({ order_id: 'previous-order' });
    fake.telemetry.metrics.addDimensions({ channel: 'web' });

    await instrument(fake.telemetry, respond(200))(apiEvent(), lambdaContext());

    expect(fake.events[0]?.keys).not.toHaveProperty('order_id');
    expect(fake.dimensionSets).not.toContainEqual({ channel: 'web' });
  });

  test('ignores a client id header, so only the authorizer sets client_id', async () => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(200))(
      apiEvent({ claims: {}, headers: { 'Client-Id': 'spoofed' } }),
      lambdaContext(),
    );

    expect(fake.events[0]?.keys).not.toHaveProperty('client_id');
  });

  test('omits a client_id claim that is not a string', async () => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(200))(
      apiEvent({ claims: { client_id: 42 } }),
      lambdaContext(),
    );

    expect(fake.events[0]?.keys).not.toHaveProperty('client_id');
  });
});

// Bun can collect a channel that has subscribers, which drops the subscription, so the test holds the channels it publishes on.
const fetchCreated = channel('undici:request:create');
const fetchFinished = channel('undici:request:trailers');

let silentServer: Server | undefined;
let hungRequest: ClientRequest | undefined;

afterEach(() => {
  hungRequest?.destroy();
  silentServer?.closeAllConnections();
  silentServer?.close();
  hungRequest = undefined;
  silentServer = undefined;
});

// Accepts the connection and never answers, like a dependency that hangs.
const listenSilently = async (): Promise<number> => {
  const server = createServer(() => {});
  silentServer = server;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Silent server has no port');
  }

  return address.port;
};

// Lambda's deadline lands 50ms after the invocation starts.
const DEADLINE_MARGIN_MS = 1_000;
const nearDeadline = (): Context => lambdaContext(1_050);

describe('instrument with a deadline margin', () => {
  test('writes the wide event before the Lambda deadline, naming the call still open', async () => {
    const port = await listenSilently();
    const fake = fakeTelemetry();
    const handler = async (): Promise<APIGatewayProxyResult> => {
      hungRequest = request(
        `http://127.0.0.1:${port}/configuration?session_token=secret`,
        {
          method: 'POST',
          headers: { 'x-amz-target': 'DynamoDB_20120810.PutItem' },
        },
      );
      hungRequest.on('error', () => {});
      hungRequest.end();
      return neverReturns();
    };

    void instrument(fake.telemetry, handler, {
      deadlineMarginMs: DEADLINE_MARGIN_MS,
    })(apiEvent(), nearDeadline());
    await sleep(150);

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]).toMatchObject({
      level: 'error',
      message: 'invocation',
      keys: {
        outcome: 'timeout',
        open_calls: [
          {
            method: 'POST',
            host: '127.0.0.1',
            path: '/configuration',
            target: 'DynamoDB_20120810.PutItem',
            open_ms: expect.any(Number),
          },
        ],
      },
    });
  });

  test('names an open fetch and leaves out the ones that finished', async () => {
    const fake = fakeTelemetry();
    const handler = async (): Promise<APIGatewayProxyResult> => {
      const token = {
        origin: 'https://partner.example.com',
        method: 'POST',
        path: '/oauth/token',
      };
      const order = {
        origin: 'https://partner.example.com',
        method: 'POST',
        path: '/orders',
      };
      fetchCreated.publish({ request: token });
      fetchFinished.publish({ request: token });
      fetchCreated.publish({ request: order });
      return neverReturns();
    };

    void instrument(fake.telemetry, handler, {
      deadlineMarginMs: DEADLINE_MARGIN_MS,
    })(apiEvent(), nearDeadline());
    await sleep(150);

    expect(fake.events[0]?.keys.open_calls).toEqual([
      {
        method: 'POST',
        host: 'partner.example.com',
        path: '/orders',
        open_ms: expect.any(Number),
      },
    ]);
  });

  test('writes one wide event when the handler returns after the deadline event', async () => {
    const fake = fakeTelemetry();
    const handler = async (): Promise<APIGatewayProxyResult> => {
      await sleep(150);
      return { statusCode: 200, body: '{}' };
    };

    await instrument(fake.telemetry, handler, {
      deadlineMarginMs: DEADLINE_MARGIN_MS,
    })(apiEvent(), nearDeadline());

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]?.level).toBe('error');
  });

  test('writes the usual wide event when the handler returns in time', async () => {
    const fake = fakeTelemetry();

    await instrument(fake.telemetry, respond(200), {
      deadlineMarginMs: DEADLINE_MARGIN_MS,
    })(apiEvent(), nearDeadline());
    await sleep(150);

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]?.level).toBe('info');
  });
});
