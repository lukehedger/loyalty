import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AccessLogField,
  AccessLogFormat,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  LogGroupLogDestination,
  MethodLoggingLevel,
  type MethodOptions,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type Route = {
  readonly authorizationScopes?: readonly string[];
  readonly handler: IFunction;
  readonly method: HttpMethod;
  readonly path: string;
  readonly public?: boolean;
};

export type ApiProps = {
  readonly description: string;
  readonly name: string;
  readonly routes: readonly Route[];
  readonly userPoolArns: readonly string[];
};

export class Api extends Construct {
  public readonly restApi: RestApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    if (props.userPoolArns.length === 0) {
      throw new Error(`Api ${props.name} needs at least one Cognito user pool`);
    }

    const accessLogs = new LogGroup(this, 'AccessLogs', {
      logGroupName: `/aws/apigateway/${props.name}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_MONTH,
    });

    // Access and execution logging need the account's API Gateway CloudWatch role, which is set once per account.
    this.restApi = new RestApi(this, 'Resource', {
      cloudWatchRole: false,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(accessLogs),
        accessLogFormat: AccessLogFormat.custom(
          JSON.stringify({
            request_id: AccessLogField.contextRequestId(),
            request_time_epoch: AccessLogField.contextRequestTimeEpoch(),
            http_method: AccessLogField.contextHttpMethod(),
            resource_path: AccessLogField.contextResourcePath(),
            status: AccessLogField.contextStatus(),
            response_latency_ms: AccessLogField.contextResponseLatency(),
            integration_latency_ms: AccessLogField.contextIntegrationLatency(),
            integration_status: AccessLogField.contextIntegrationStatus(),
            error_message: AccessLogField.contextErrorMessage(),
            error_response_type: AccessLogField.contextErrorResponseType(),
            client_id: AccessLogField.contextAuthorizerClaims('client_id'),
            xray_trace_id: AccessLogField.contextXrayTraceId(),
          }),
        ),
        dataTraceEnabled: false,
        loggingLevel: MethodLoggingLevel.ERROR,
        metricsEnabled: true,
        stageName: 'live',
        tracingEnabled: true,
      },
      description: props.description,
      restApiName: props.name,
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authoriser', {
      authorizerName: `${props.name}-authoriser`,
      cognitoUserPools: props.userPoolArns.map((arn, index) =>
        UserPool.fromUserPoolArn(this, `UserPool${index}`, arn),
      ),
    });

    for (const route of props.routes) {
      this.restApi.root
        .resourceForPath(route.path)
        .addMethod(
          route.method,
          new LambdaIntegration(route.handler, { allowTestInvoke: false }),
          toMethodOptions(route, authorizer),
        );
    }
  }
}

const toMethodOptions = (
  route: Route,
  authorizer: CognitoUserPoolsAuthorizer,
): MethodOptions | undefined => {
  if (route.public && route.authorizationScopes) {
    throw new Error(
      `Route ${route.method} ${route.path} is public, so it cannot require authorisation scopes`,
    );
  }
  if (route.public) return undefined;

  return {
    authorizationScopes: route.authorizationScopes && [
      ...route.authorizationScopes,
    ],
    authorizationType: AuthorizationType.COGNITO,
    authorizer,
  };
};
