import { describe, expect, test } from 'bun:test';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Api, LambdaFunction, type Route } from '../index.ts';

const USER_POOL_ARN =
  'arn:aws:cognito-idp:eu-west-1:123456789012:userpool/eu-west-1_example';

const synth = (
  toRoutes: (handler: LambdaFunction) => readonly Route[],
): Template => {
  // Skipping esbuild keeps synth fast. No test here reads the bundle.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'eu-west-1' },
  });
  const handler = new LambdaFunction(stack, 'GetOrderFunction', {
    description: 'Returns one order to the order API',
    entry: new URL('fixtures/handler.ts', import.meta.url).pathname,
    functionName: 'get-order',
    memorySize: 512,
    timeout: Duration.seconds(10),
  });
  new Api(stack, 'OrderApi', {
    description: 'Serves orders to authenticated clients',
    name: 'order-api',
    routes: toRoutes(handler),
    userPoolArns: [USER_POOL_ARN],
  });
  return Template.fromStack(stack);
};

const methodFor = (template: Template, httpMethod: string): unknown =>
  Object.values(template.findResources('AWS::ApiGateway::Method')).find(
    (resource) =>
      (resource.Properties as { HttpMethod?: unknown }).HttpMethod ===
      httpMethod,
  );

describe('Api', () => {
  test('routes a request to its handler behind the Cognito authoriser', () => {
    const template = synth((handler) => [
      {
        authorizationScopes: ['orders/read'],
        handler,
        method: 'GET',
        path: 'orders/{orderId}',
      },
    ]);

    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Name: 'order-api-authoriser',
      ProviderARNs: [USER_POOL_ARN],
      Type: 'COGNITO_USER_POOLS',
    });
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: '{orderId}',
    });
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      AuthorizationScopes: ['orders/read'],
      AuthorizationType: 'COGNITO_USER_POOLS',
      HttpMethod: 'GET',
      Integration: Match.objectLike({ Type: 'AWS_PROXY' }),
    });
  });

  test('lets API Gateway invoke the handler', () => {
    synth((handler) => [
      { handler, method: 'GET', path: 'orders/{orderId}' },
    ]).hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      FunctionName: {
        'Fn::GetAtt': [Match.stringLikeRegexp('^GetOrderFunction'), 'Arn'],
      },
      Principal: 'apigateway.amazonaws.com',
    });
  });

  test('leaves a public route open while others stay protected', () => {
    const template = synth((handler) => [
      { handler, method: 'GET', path: 'orders/{orderId}' },
      { handler, method: 'POST', path: 'webhooks', public: true },
    ]);

    expect(methodFor(template, 'GET')).toMatchObject({
      Properties: { AuthorizationType: 'COGNITO_USER_POOLS' },
    });
    expect(methodFor(template, 'POST')).toMatchObject({
      Properties: { AuthorizationType: 'NONE' },
    });
  });

  test('traces and access logs the stage without request payloads', () => {
    const template = synth((handler) => [
      { handler, method: 'GET', path: 'orders/{orderId}' },
    ]);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/apigateway/order-api',
      RetentionInDays: 30,
    });
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      AccessLogSetting: Match.objectLike({
        Format: Match.stringLikeRegexp('xray_trace_id'),
      }),
      MethodSettings: [
        Match.objectLike({
          DataTraceEnabled: false,
          LoggingLevel: 'ERROR',
          MetricsEnabled: true,
        }),
      ],
      StageName: 'live',
      TracingEnabled: true,
    });
  });

  test('rejects an API with no user pool', () => {
    const stack = new Stack(new App(), 'TestStack');

    expect(
      () =>
        new Api(stack, 'OrderApi', {
          description: 'Serves orders to authenticated clients',
          name: 'order-api',
          routes: [],
          userPoolArns: [],
        }),
    ).toThrow('Api order-api needs at least one Cognito user pool');
  });

  test('rejects a public route that requires scopes', () => {
    expect(() =>
      synth((handler) => [
        {
          authorizationScopes: ['orders/write'],
          handler,
          method: 'POST',
          path: 'webhooks',
          public: true,
        },
      ]),
    ).toThrow(
      'Route POST webhooks is public, so it cannot require authorisation scopes',
    );
  });
});
