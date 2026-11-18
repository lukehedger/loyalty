---
paths:
  - "infra/**"
  - "packages/constructs/**"
---

# CDK

`ARCHITECTURE.md` sets what the infrastructure contains. These rules set how the CDK code is written.

## Layout

**[MUST]** One CDK app and one stack per account. No nested stacks.

```
infra/
  src/
    app.ts       # CDK app
    stack.ts     # the stack
  tests/
    stack.test.ts
  cdk.json       # "app": "bun src/app.ts"
```

`cdk.json` stays at the `infra/` root, so the CLI runs and writes `cdk.out` there. Paths in `stack.ts` resolve relative to `src/`.

Run the CDK CLI from the catalog-pinned `aws-cdk` package through a `cdk` script, with no wrapper around it.

## App

**[MUST]** Keep `app.ts` minimal. Read every environment variable, throw an informative error when a required one is missing and pass the values to the stack as props. Set `env.account` and `env.region` from `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION`, or from the pipeline's variables.

## Stack

**[MUST]** Type the stack's props by extending `StackProps`. Keep the constructor short and provision resources in named private methods.

**[MUST]** Keep infrastructure configuration in TypeScript props, never in separate JSON files. Runtime configuration is AppConfig.

## Environments

**[MUST]** A stack has no concept of stage. Express each difference between environments as an explicit, purposeful prop.

```ts
type AppStackProps = StackProps & {
  readonly enableBackups: boolean;
  readonly enableAlarms: boolean;
};
```

Never branch on `if (stage === 'prod')`.

**[SHOULD]** Deploy alarms and dashboards only where someone acts on them, usually production. Gate them with a prop such as `enableAlarms`.

## Constructs

**[MUST]** Create every Lambda function with the project's function construct, never a raw `NodejsFunction`. The construct applies ARM64, the current Node.js LTS runtime, minified ESM bundles, active tracing, a log group with fixed retention and the X-Ray permissions. It also requires `description`, `functionName`, `memorySize` and `timeout`.

**[SHOULD]** Group resources with a single role into a component construct named by its purpose, such as `OrderIntakeApi`.

**[MUST]** Do not create a new L3 construct until the pattern repeats in three or more places with the same defaults. Until then, use L2 constructs directly.

## Resources

**[MUST]** Give construct IDs PascalCase names that state the purpose: `PendingFraudAnalysisQueue`, not `Queue`.

**[MUST]** Give every resource a name and a description that explains its purpose instead of repeating its name.

**[MUST]** Enable X-Ray tracing wherever the service supports it.

**[MUST]** Treat a construct ID as permanent. Changing one replaces the resource. A replaced table loses its data. Check `cdk diff` for replacements before you rename.

**[MUST]** Share values with other stacks through `CfnOutput` and document each output in the service README.

## Tests

**[MUST]** Test the stack with `aws-cdk-lib/assertions`. Cover what joins resources together:

- **Configuration** of each resource and its integrations
- **Permissions** that let one resource call another
- **Payloads** passed between resources

## Delivery

**[MUST]** One pipeline deploys the stack through every environment in order.
