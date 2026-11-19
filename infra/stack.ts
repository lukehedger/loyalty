import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { profiles, toDeployableProfile } from '@loyalty/config';
import { Api, Config, LambdaFunction, Table } from '@loyalty/constructs';
import { type App, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';

export type ConfigEnvironment = 'production' | 'test';

export type AppStackProps = StackProps & {
  readonly configEnvironment: ConfigEnvironment;
  readonly deletionProtection: boolean;
  readonly userPoolArns: readonly string[];
};

const CONFIG_ENVIRONMENTS = join(
  import.meta.dirname,
  '../packages/config/environments',
);

const API_HANDLERS = join(import.meta.dirname, '../api');

type AccountFunctionProps = {
  readonly description: string;
  readonly handler: string;
};

export class AppStack extends Stack {
  constructor(scope: App, id: string, props: AppStackProps) {
    super(scope, id, props);

    const table = this.provisionState(props);
    const config = this.provisionConfig(props);
    this.provisionApi(props, table, config);
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

  private provisionApi(
    props: AppStackProps,
    table: Table,
    config: Config,
  ): Api {
    // Every handler composes the same runtime at import, so each gets the same environment.
    const environment = {
      APPCONFIG_APPLICATION: config.applicationName,
      TABLE_NAME: table.tableName,
    };
    const accountFunction = (
      id: string,
      { description, handler }: AccountFunctionProps,
    ): LambdaFunction =>
      new LambdaFunction(this, id, {
        description,
        entry: join(API_HANDLERS, `${handler}.ts`),
        environment,
        functionName: `${this.stackName}-${handler}`,
        memorySize: 512,
        timeout: Duration.seconds(10),
      });

    const openAccount = accountFunction('OpenAccountFunction', {
      description: 'Opens the account of a member with a zero balance',
      handler: 'open-account',
    });
    const earnPoints = accountFunction('EarnPointsFunction', {
      description: 'Awards points for a purchase at the earn rate in AppConfig',
      handler: 'earn-points',
    });
    const spendPoints = accountFunction('SpendPointsFunction', {
      description: 'Deducts the points a member spends on a reward',
      handler: 'spend-points',
    });
    const readBalance = accountFunction('ReadBalanceFunction', {
      description: 'Returns the balance of a member account',
      handler: 'read-balance',
    });

    for (const writer of [openAccount, earnPoints, spendPoints]) {
      table.grantReadWriteData(writer);
    }
    table.grantReadData(readBalance);
    config.grantRead(earnPoints);

    return new Api(this, 'AccountApi', {
      description: 'Opens accounts, earns and spends points and reads balances',
      name: `${this.stackName}-api`,
      routes: [
        { handler: openAccount, method: 'POST', path: 'accounts' },
        {
          handler: earnPoints,
          method: 'POST',
          path: 'accounts/{memberId}/earns',
        },
        {
          handler: spendPoints,
          method: 'POST',
          path: 'accounts/{memberId}/spends',
        },
        {
          handler: readBalance,
          method: 'GET',
          path: 'accounts/{memberId}/balance',
        },
      ],
      userPoolArns: props.userPoolArns,
    });
  }
}
