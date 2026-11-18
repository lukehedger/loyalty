import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { profiles, toDeployableProfile } from '@loyalty/config';
import { Config, Table } from '@loyalty/constructs';
import { type App, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';

export type ConfigEnvironment = 'production' | 'test';

export type AppStackProps = StackProps & {
  readonly configEnvironment: ConfigEnvironment;
  readonly deletionProtection: boolean;
};

const CONFIG_ENVIRONMENTS = join(
  import.meta.dirname,
  '../../packages/config/environments',
);

export class AppStack extends Stack {
  constructor(scope: App, id: string, props: AppStackProps) {
    super(scope, id, props);

    this.provisionState(props);
    this.provisionConfig(props);
  }

  private provisionState(props: AppStackProps): Table {
    return new Table(this, 'StateTable', {
      deletionProtection: props.deletionProtection,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      tableName: `${this.stackName}-state`,
    });
  }

  private provisionConfig(props: AppStackProps): Config {
    return new Config(this, 'RuntimeConfig', {
      applicationName: this.stackName,
      profiles: profiles.map((profile) =>
        toDeployableProfile(
          profile,
          readFileSync(
            join(
              CONFIG_ENVIRONMENTS,
              props.configEnvironment,
              `${profile.name}.json`,
            ),
            'utf8',
          ),
        ),
      ),
    });
  }
}
