import { Duration } from 'aws-cdk-lib';
import {
  Application,
  ConfigurationContent,
  DeploymentStrategy,
  Environment,
  HostedConfiguration,
  JsonSchemaValidator,
  RolloutStrategy,
} from 'aws-cdk-lib/aws-appconfig';
import type { Grant, IGrantable } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export type ConfigProfile = {
  readonly content: string;
  readonly jsonSchema: object;
  readonly name: string;
};

export type ConfigProps = {
  readonly applicationName: string;
  readonly profiles: readonly ConfigProfile[];
};

export class Config extends Construct {
  public readonly applicationName: string;
  public readonly environmentName = 'default';
  private readonly environment: Environment;

  constructor(scope: Construct, id: string, props: ConfigProps) {
    super(scope, id);

    this.applicationName = props.applicationName;

    const application = new Application(this, 'Application', {
      applicationName: props.applicationName,
      description: `Runtime configuration for ${props.applicationName}`,
    });

    this.environment = new Environment(this, 'Environment', {
      application,
      description: `The ${props.applicationName} configuration that this stack's functions read`,
      environmentName: this.environmentName,
    });

    // The deploy that merges a profile change is the rollout, so AppConfig adds no ramp or bake time.
    const deploymentStrategy = new DeploymentStrategy(
      this,
      'InstantDeploymentStrategy',
      {
        deploymentStrategyName: `${props.applicationName}-instant`,
        description: 'Makes a new configuration version live at once',
        rolloutStrategy: RolloutStrategy.linear({
          deploymentDuration: Duration.minutes(0),
          finalBakeTime: Duration.minutes(0),
          growthFactor: 100,
        }),
      },
    );

    for (const profile of props.profiles) {
      new HostedConfiguration(this, `${toPascalCase(profile.name)}Profile`, {
        application,
        content: ConfigurationContent.fromInlineJson(profile.content),
        deploymentStrategy,
        deployTo: [this.environment],
        description: `The ${profile.name} profile, validated against its JSON schema`,
        name: profile.name,
        validators: [
          JsonSchemaValidator.fromInline(JSON.stringify(profile.jsonSchema)),
        ],
      });
    }
  }

  public grantRead(grantee: IGrantable): Grant {
    return this.environment.grantReadConfig(grantee);
  }
}

const toPascalCase = (name: string): string =>
  name
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
