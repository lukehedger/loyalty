import { describe, expect, test } from 'bun:test';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Config } from '../index.ts';

const JSON_SCHEMA = {
  properties: { enabled: { type: 'boolean' } },
  required: ['enabled'],
  type: 'object',
};

const synth = (): { readonly config: Config; readonly stack: Stack } => {
  const stack = new Stack(new App(), 'TestStack');
  const config = new Config(stack, 'RuntimeConfig', {
    applicationName: 'orders',
    profiles: [
      {
        content: '{"enabled":true}',
        jsonSchema: JSON_SCHEMA,
        name: 'feature-flags',
      },
    ],
  });
  return { config, stack };
};

describe('Config', () => {
  test('deploys each profile to the default environment at once', () => {
    const { config, stack } = synth();
    const template = Template.fromStack(stack);

    expect(config.environmentName).toBe('default');
    template.hasResourceProperties('AWS::AppConfig::Application', {
      Name: 'orders',
    });
    template.hasResourceProperties('AWS::AppConfig::Environment', {
      Name: 'default',
    });
    template.hasResourceProperties('AWS::AppConfig::DeploymentStrategy', {
      DeploymentDurationInMinutes: 0,
      FinalBakeTimeInMinutes: 0,
      GrowthFactor: 100,
      Name: 'orders-instant',
    });
    template.hasResourceProperties(
      'AWS::AppConfig::HostedConfigurationVersion',
      { Content: '{"enabled":true}', ContentType: 'application/json' },
    );
    template.resourceCountIs('AWS::AppConfig::Deployment', 1);
  });

  test('validates each profile against its JSON schema', () => {
    Template.fromStack(synth().stack).hasResourceProperties(
      'AWS::AppConfig::ConfigurationProfile',
      {
        Name: 'feature-flags',
        Validators: [
          { Content: JSON.stringify(JSON_SCHEMA), Type: 'JSON_SCHEMA' },
        ],
      },
    );
  });

  test('grants read access to the environment configuration only', () => {
    const { config, stack } = synth();
    config.grantRead(
      new Role(stack, 'ReaderRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      }),
    );

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: [
              'appconfig:GetLatestConfiguration',
              'appconfig:StartConfigurationSession',
            ],
            Resource: {
              'Fn::Join': ['', Match.arrayWith(['/configuration/*'])],
            },
          }),
        ],
      },
    });
  });
});
