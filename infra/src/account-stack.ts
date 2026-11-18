import { type App, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnAccount } from 'aws-cdk-lib/aws-apigateway';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

// API Gateway holds one CloudWatch role per account and region, so every app stack instance in the account shares it.
export class AccountStack extends Stack {
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props);

    const role = new Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      description:
        'Lets API Gateway write access and execution logs to CloudWatch',
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonAPIGatewayPushToCloudWatchLogs',
        ),
      ],
    });

    new CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: role.roleArn,
    });
  }
}
