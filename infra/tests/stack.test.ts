import { describe, expect, test } from 'bun:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AccountStack } from '../account-stack.ts';
import { AppStack, type ConfigEnvironment } from '../stack.ts';

const env = { account: '123456789012', region: 'eu-west-1' };

const USER_POOL_ARN =
  'arn:aws:cognito-idp:eu-west-1:123456789012:userpool/eu-west-1_example';

const synth = (
  configEnvironment: ConfigEnvironment,
  deletionProtection = false,
): Template =>
  Template.fromStack(
    // Skipping esbuild keeps synth fast. No test here reads the bundle.
    new AppStack(
      new App({ context: { 'aws:cdk:bundling-stacks': [] } }),
      'app',
      {
        configEnvironment,
        deletionProtection,
        env,
        userPoolArns: [USER_POOL_ARN],
      },
    ),
  );

type Resource = { readonly Properties?: Record<string, unknown> };

// Every IAM action granted to the role of the function whose construct ID starts with the prefix.
const actionsGrantedTo = (template: Template, functionId: string): string[] =>
  Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((policy: Resource) =>
      JSON.stringify(policy.Properties?.Roles).includes(
        `${functionId}ServiceRole`,
      ),
    )
    .flatMap((policy: Resource) => {
      const document = policy.Properties?.PolicyDocument as {
        readonly Statement: readonly { readonly Action: string | string[] }[];
      };
      return document.Statement.flatMap(({ Action }) => Action);
    });

describe('AppStack', () => {
  test('creates the state table with the keys the store writes', () => {
    synth('test').hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      TableName: 'app-state',
    });
  });

  test.each([true, false])(
    'sets deletion protection to %p when asked',
    (deletionProtection) => {
      synth('test', deletionProtection).hasResourceProperties(
        'AWS::DynamoDB::GlobalTable',
        {
          Replicas: [
            Match.objectLike({ DeletionProtectionEnabled: deletionProtection }),
          ],
        },
      );
    },
  );

  test.each(['test', 'production'] as const)(
    'deploys every %s config profile',
    (configEnvironment) => {
      const template = synth(configEnvironment);

      for (const Name of ['feature-flags', 'earn-rate']) {
        template.hasResourceProperties('AWS::AppConfig::ConfigurationProfile', {
          Name,
        });
      }
    },
  );

  test.each([
    ['POST', 'accounts', 'OpenAccountFunction'],
    ['POST', '{memberId}', 'EarnPointsFunction'],
    ['GET', 'balance', 'ReadBalanceFunction'],
  ])(
    'routes %s .../%s to %s behind Cognito',
    (HttpMethod, _path, functionId) => {
      synth('test').hasResourceProperties('AWS::ApiGateway::Method', {
        AuthorizationType: 'COGNITO_USER_POOLS',
        HttpMethod,
        Integration: Match.objectLike({
          Uri: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([
                Match.objectLike({
                  'Fn::GetAtt': [
                    Match.stringLikeRegexp(`^${functionId}`),
                    'Arn',
                  ],
                }),
              ]),
            ]),
          }),
        }),
      });
    },
  );

  test('serves every account path', () => {
    const template = synth('test');

    for (const PathPart of [
      'accounts',
      '{memberId}',
      'earns',
      'spends',
      'balance',
    ]) {
      template.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart });
    }
    template.resourceCountIs('AWS::ApiGateway::Method', 4);
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      ProviderARNs: [USER_POOL_ARN],
    });
  });

  test('gives each handler the table and the config application', () => {
    synth('test').hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'app-earn-points',
      Environment: {
        Variables: Match.objectLike({
          APPCONFIG_APPLICATION: 'app',
          TABLE_NAME: { Ref: Match.stringLikeRegexp('^StateTable') },
        }),
      },
    });
  });

  test('lets only the writers write to the table', () => {
    const template = synth('test');

    expect(actionsGrantedTo(template, 'SpendPointsFunction')).toContain(
      'dynamodb:PutItem',
    );
    expect(actionsGrantedTo(template, 'ReadBalanceFunction')).toContain(
      'dynamodb:Query',
    );
    expect(actionsGrantedTo(template, 'ReadBalanceFunction')).not.toContain(
      'dynamodb:PutItem',
    );
  });

  test('lets only the earn handler read the earn rate', () => {
    const template = synth('test');

    expect(actionsGrantedTo(template, 'EarnPointsFunction')).toContain(
      'appconfig:GetLatestConfiguration',
    );
    for (const functionId of [
      'OpenAccountFunction',
      'SpendPointsFunction',
      'ReadBalanceFunction',
    ]) {
      expect(actionsGrantedTo(template, functionId)).not.toContain(
        'appconfig:GetLatestConfiguration',
      );
    }
  });
});

describe('AccountStack', () => {
  test('gives API Gateway a role to write logs to CloudWatch', () => {
    const template = Template.fromStack(
      new AccountStack(new App(), 'account', { env }),
    );

    template.hasResourceProperties('AWS::ApiGateway::Account', {
      CloudWatchRoleArn: { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] },
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'apigateway.amazonaws.com' },
          }),
        ],
      },
    });
  });
});
