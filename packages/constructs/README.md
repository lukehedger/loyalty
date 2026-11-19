# @loyalty/constructs

The L3 CDK constructs that `infra/` builds the stack from. Each one wires an AWS primitive the same way every time, so the stack states only what differs.

## Public API

- `LambdaFunction` extends `NodejsFunction`. It applies ARM64, Node.js 24, a minified ESM bundle built by esbuild, active X-Ray tracing and its own log group with three-month retention. Requires `description`, `entry`, `functionName`, `memorySize` and `timeout`. Optional `environment` and `durableConfig`, which makes it a durable function.
- `Api` is the one REST API. Each `Route` maps a `method` and `path` to a `handler`. Every route sits behind the Cognito authoriser unless it sets `public: true`. A protected route can require `authorizationScopes`. The stage traces requests and writes JSON access logs without request or response payloads. Requires `description`, `name`, `routes` and `userPoolArns`.
- `Config` is the AppConfig application, its `default` environment and one hosted profile per entry in `profiles`. Each profile is validated against its JSON schema and goes live at once. `grantRead(grantee)` grants read access to the environment's profiles only. Requires `applicationName` and `profiles`.
- `Table` extends `TableV2` with on-demand billing, point-in-time recovery and an AWS managed KMS key. A table with `deletionProtection` is retained when the stack is deleted. One without it is deleted, so a disposable environment leaves nothing behind. Requires `deletionProtection`, `partitionKey` and `tableName`.
- `Monitoring` is an error alarm and a RED dashboard for the API and the functions it is given. The composite `errorAlarm` fires when the API returns 5XX responses or any function errors, and notifies `alarmTopic` on ALARM and OK. Requires `alarmTopic`, `api`, `functions` and `name`. Create it only where someone acts on its alarms.

## Example

```ts
const getOrder = new LambdaFunction(this, 'GetOrderFunction', {
  description: 'Returns one order to API clients',
  entry: join(import.meta.dirname, '../api/get-order.ts'),
  functionName: 'get-order',
  memorySize: 512,
  timeout: Duration.seconds(10),
});
config.grantRead(getOrder);
table.grantReadData(getOrder);

const api = new Api(this, 'OrderApi', {
  description: 'Serves orders to authenticated clients',
  name: 'order-api',
  routes: [{ handler: getOrder, method: 'GET', path: 'orders/{orderId}' }],
  userPoolArns: props.userPoolArns,
});

if (props.enableAlarms) {
  new Monitoring(this, 'Monitoring', {
    alarmTopic,
    api,
    functions: [getOrder],
    name: 'orders',
  });
}
```

The API sets no account-level CloudWatch role. API Gateway logging needs one, so set it once per account.
