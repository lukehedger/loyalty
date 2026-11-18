import type { Telemetry } from '@loyalty/telemetry';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

export const apiEvent = (
  request: Pick<APIGatewayProxyEvent, 'body' | 'pathParameters'>,
): APIGatewayProxyEvent => ({
  body: request.body,
  headers: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  multiValueHeaders: {},
  multiValueQueryStringParameters: null,
  path: '/accounts',
  pathParameters: request.pathParameters,
  queryStringParameters: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'api',
    authorizer: undefined,
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
    path: '/live/accounts',
    protocol: 'HTTP/1.1',
    requestId: 'request-1',
    requestTimeEpoch: 0,
    resourceId: 'resource',
    resourcePath: '/accounts',
    stage: 'live',
  },
  resource: '/accounts',
  stageVariables: null,
});

export const lambdaContext: Context = {
  awsRequestId: 'request-1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'handler',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123456789012:function:handler',
  logGroupName: '/aws/lambda/handler',
  logStreamName: 'stream',
  memoryLimitInMB: '512',
  getRemainingTimeInMillis: () => 10_000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

// Records the keys that reach the wide event. Tracing runs the work directly.
export const fakeTelemetry = () => {
  const keys = new Map<string, unknown>();
  const telemetry: Telemetry = {
    logger: {
      appendKeys: (appended) => {
        for (const [key, value] of Object.entries(appended))
          keys.set(key, value);
      },
      resetKeys: () => keys.clear(),
      info: () => {},
      error: () => {},
    },
    metrics: {
      addDimensions: () => {},
      addMetric: () => {},
      clearDimensions: () => {},
      flush: () => {},
    },
    tracer: {
      addAnnotation: () => {},
      addMetadata: () => {},
      annotateColdStart: () => {},
      trace: (_name, work) => work(),
    },
  };

  return { keys, telemetry };
};

export const jsonBody = (body: string): unknown => JSON.parse(body);
