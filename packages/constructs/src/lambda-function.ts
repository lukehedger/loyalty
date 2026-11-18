import { fileURLToPath } from 'node:url';
import { type Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Architecture,
  type DurableConfig,
  Runtime,
  Tracing,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

const LOCK_FILE = fileURLToPath(new URL('../../../bun.lock', import.meta.url));

export type LambdaFunctionProps = {
  readonly description: string;
  readonly durableConfig?: DurableConfig;
  readonly entry: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly functionName: string;
  readonly memorySize: number;
  readonly timeout: Duration;
};

export class LambdaFunction extends NodejsFunction {
  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id, {
      architecture: Architecture.ARM_64,
      bundling: {
        // Bundled CommonJS dependencies still call `require`, which ESM does not define.
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        format: OutputFormat.ESM,
        minify: true,
      },
      depsLockFilePath: LOCK_FILE,
      description: props.description,
      durableConfig: props.durableConfig,
      entry: props.entry,
      environment: props.environment,
      functionName: props.functionName,
      logGroup: new LogGroup(scope, `${id}LogGroup`, {
        logGroupName: `/aws/lambda/${props.functionName}`,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: RetentionDays.THREE_MONTHS,
      }),
      memorySize: props.memorySize,
      runtime: Runtime.NODEJS_24_X,
      timeout: props.timeout,
      tracing: Tracing.ACTIVE,
    });
  }
}
