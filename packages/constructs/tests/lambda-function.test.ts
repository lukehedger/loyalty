import { describe, expect, test } from 'bun:test';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { LambdaFunction, type LambdaFunctionProps } from '../index.ts';

const ENTRY = new URL('fixtures/handler.ts', import.meta.url).pathname;

const synth = (props: Partial<LambdaFunctionProps> = {}): Template => {
  // Skipping esbuild keeps synth fast. No test here reads the bundle.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new Stack(app, 'TestStack');
  new LambdaFunction(stack, 'GetOrderFunction', {
    description: 'Returns one order to the order API',
    entry: ENTRY,
    environment: { TABLE_NAME: 'orders' },
    functionName: 'get-order',
    memorySize: 512,
    timeout: Duration.seconds(10),
    ...props,
  });
  return Template.fromStack(stack);
};

describe('LambdaFunction', () => {
  test('applies the runtime defaults and the required props', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      Description: 'Returns one order to the order API',
      Environment: { Variables: Match.objectLike({ TABLE_NAME: 'orders' }) },
      FunctionName: 'get-order',
      Handler: 'index.handler',
      MemorySize: 512,
      Runtime: 'nodejs24.x',
      Timeout: 10,
      TracingConfig: { Mode: 'Active' },
    });
  });

  test('writes to its own log group with fixed retention', () => {
    const template = synth();

    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      Properties: {
        LogGroupName: '/aws/lambda/get-order',
        RetentionInDays: 90,
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      LoggingConfig: {
        LogGroup: { Ref: Match.stringLikeRegexp('^GetOrderFunctionLogGroup') },
      },
    });
  });

  test('grants the role permission to send traces to X-Ray', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
            Effect: 'Allow',
            Resource: '*',
          }),
        ]),
      },
    });
  });

  test('configures a durable function and its execution role policy', () => {
    const template = synth({
      durableConfig: { executionTimeout: Duration.hours(1) },
      timeout: Duration.minutes(15),
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      DurableConfig: Match.objectLike({ ExecutionTimeout: 3600 }),
    });
    const roles = Object.values(template.findResources('AWS::IAM::Role'));
    expect(JSON.stringify(roles)).toContain(
      'AWSLambdaBasicDurableExecutionRolePolicy',
    );
  });
});
