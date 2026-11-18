# Architecture

This document defines the architecture of the system and the rules that keep its structure intact. Read [DOMAIN.md](DOMAIN.md) alongside it. DOMAIN.md defines the model. This document defines where the code that implements it lives and how it runs.

If a change genuinely needs a rule to change, update this document in the same change and give the reason. Do not erode a rule with small diversions.

## Engineering approach

Reliability comes first. Make everything observable, monitor and analyse it continuously and keep the system releasable at all times.

The architecture is Lambda-centric, with the fewest infrastructure components and third-party dependencies that do the job.

The domain is modelled as state transitions governed by rules (see DOMAIN.md). The rules live in a pure _functional core_. An _imperative shell_ of closed layers surrounds the core and does all I/O. Each layer can only call the layer directly below it. External integrations are strategies selected by a registry.

These properties let an agent verify its own work and reach near-deterministic outcomes:

- **Closed layers, split by domain.** Each layer only calls the layer below. Modules are split by domain, not by technical role (controllers, services).
- **Functional core, imperative shell.** Decisions are pure functions of state and input. I/O happens only in the shell.
- **Schema at the boundaries.** Every input and output is parsed against a schema where it enters or leaves the system.
- **Negative-space programming.** Illegal states are unrepresentable and unhandled cases fail to compile. Assertions state what must never happen at run time and fail loudly when it does. `.claude/rules/typescript.md` lists the techniques.
- **Disposable environments.** Any environment can be created and destroyed from code alone.

## Core rules

### One stack definition, any number of instances

All application infrastructure lives in one CDK stack definition. Every environment is an instance of it: production, staging and each disposable environment for a branch or an agent. Instances differ through config and account context only, never through per-environment infrastructure. One definition keeps each deployment atomic. It also means a disposable environment runs the same infrastructure as production. Internal tools with no application routes may have their own stack. Settings AWS holds once per account and region, such as API Gateway's CloudWatch role, live in `infra/src/account-stack.ts`, which every instance in the account shares.

### Handlers stay thin

A handler parses the request, validates it against a schema, routes it and maps the result. It holds no business logic, no integration branching and no direct SDK calls. Handlers export `makeHandler(deps)` so tests inject inline fakes. A handler that is hard to fake has absorbed logic from a lower layer.

### The request pipeline is a fixed sequence of layers

```
API Gateway  ->  handler  ->  schema  ->  router  ->  adapter  ->  gate  ->  store
                             validate    resolve     translate      |    load, persist
                                                                    v
                                                                   core
                                                                  decide
```

Shell layers only call the layer below. Skipping a layer or calling upward removes the separation that makes each layer testable and replaceable on its own.

The core sits outside the chain. The gate is its only caller. The core calls nothing.

### State changes go through the core

The core validates every state transition with a pure function. Only the core enforces lifecycle validity and domain rules.

The gate runs every state change in three steps. It loads the current state from the store. It passes the state and the command to the core, which returns a decision. It persists an approved decision with a conditional write and returns a rejection unchanged. The core never calls the store or performs any other I/O. Persistence sits behind a store interface.

State is an append-only stream of immutable events. Current state is a projection of those events and is never stored or mutated in place. Append-only removes write conflicts, gives a complete audit trail and makes commands idempotent.

### Integrations are isolated behind one adapter interface

All behaviour specific to an external system lives behind one adapter interface in its own package. An adapter can be complex inside but presents a uniform interface outside. Shared packages never branch on a specific integration. `if (provider === 'x')` outside the adapter package means the abstraction has leaked. Push it back down.

### Schemas are the only contract

Schemas define every request and response shape. They produce the compile-time types, the runtime validation and the OpenAPI spec. Do not hand-write types that duplicate a schema, hand-edit generated output or validate ad hoc in a handler.

### Routing is exhaustive and type-enforced

The supported variants are a union type and the router registry is a `Record` over that union. A new variant without a registry entry is a compile error. Capabilities are opt-in by presence. An absent capability returns a 422, not a throwing stub. Never widen the union to `string`, cast away exhaustiveness or add a default case that hides a missing entry.

### The core asserts what must never happen

The core checks its negative space with `assert` and `unreachable` from `core/src/assert.ts`. Both throw `AssertionError`. Never catch it to carry on. The gate then persists nothing and the shell responds with a 500.

### The code and DOMAIN.md share one vocabulary

`core/src/vocabulary.ts` declares every command, event, status and invariant name that DOMAIN.md defines. Derive the core's name unions from it. Never redeclare a name as a string literal elsewhere. The domain drift fitness function fails when a name exists on one side only, so a change to the model updates both in the same change.

### Reliability comes from observability, not retry machinery

Every invocation emits one wide structured event with all the context gathered during the request. Tracing, metrics and DLQ alarms complete the picture. A failed assertion emits its own failure metric with an alarm, so a broken invariant never hides among generic errors. Do not add bespoke retry frameworks, reconciliation jobs or shadow state. Idempotent writes plus observability are the reliability strategy.

### Dependencies stay minimal

Add a library only when it solves a real problem that a small amount of internal code cannot. Pin shared versions in the root `package.json` catalog. Prefer small focused packages over frameworks.

## AWS strategy

Keep the AWS surface area small. Every new primitive is one more thing to operate, monitor and reason about. Wire each primitive the same way every time.

- **Sync** - Lambda behind one API Gateway REST API. No always-on compute or containers. Handlers run on Node.js and are bundled with esbuild through CDK's `NodejsFunction`.
- **Async** - Lambda durable functions for long-running, multi-step or callback-driven work.
- **State** - DynamoDB, single-table per store, reached only through the store package.
- **Config and secrets** - runtime config is schema-validated JSON served by AppConfig. Secrets live in Secrets Manager behind a wrapper.
- **Infrastructure** - CDK, standardised through L3 constructs that apply tracing, IAM, log groups and dashboards. Extend the constructs rather than add raw resources.
- **Auth** - Cognito at the edge.

Any other async mechanism (SQS queue, S3 trigger, DynamoDB Stream consumer, EventBridge bus) is an architectural decision, not a routine addition. Each must earn its place:

- **Queue** - the work has no second copy anywhere, so a failed attempt must come back on its own.
- **S3 trigger** - the object is the unit of work. Re-putting it is the replay. Scope it to a key prefix.
- **Stream consumer** - every change it reacts to lands in one table, so subscribing beats a call at each write site.
- **Event bus** - consumers outside the system need a contract behind its own trust boundary.

A durable execution that exhausts its retries records FAILED instead of throwing, so the Lambda `Errors` alarm cannot see it. Emit and alarm on a failure metric of your own.

## Codebase structure

- `api/` - thin Lambda handlers behind API Gateway
- `async/` - handlers for durable functions, queues, schedules and streams
- `core/` - the functional core: state, transitions and domain rules
- `packages/` - shared libraries: schema, router, adapters, gate, store, config, telemetry and CDK constructs
- `infra/` - the CDK app
- `tools/` - repo-internal CLIs that agents run: fitness functions, codegen from DOMAIN.md, seed data, ephemeral stack helpers
- `docs/` - strategy documents and agent design

## Stack

The `catalog` in the root `package.json` pins every version. This section names each tool and the rule for its use.

- **TypeScript** - the only language, in strict mode. `bun check` checks the types and reports the same errors as `tsc`. It emits nothing.
- **Bun** - package manager, test runner and script runner. Bun is dev tooling only. Deployed code runs on Node.js, so it never imports `bun:` modules or uses the `Bun` global.
- **Turbo** - runs each task across the workspaces in dependency order. It caches the results, so an unchanged package is not checked again.
- **Biome** - the only linter and formatter. Its import rules enforce the layer boundaries in this document, so a layer that imports past the one below it fails CI.
- **Zod** - the only schema library. Each schema produces the compile-time type through `z.infer`, the runtime validation and the OpenAPI spec.
- **AWS CDK** - defines all infrastructure in TypeScript, in `infra/`.
- **fast-check** - property-based tests for the core. Each invariant in DOMAIN.md has a property, declared with the `invariant` helper in `core/tests/`, that holds for every generated command.
- **Stryker** - mutation tests for the core. A change to the core passes only when its tests kill at least 80% of the mutants.
- **Powertools for AWS Lambda** - Logger emits the one wide event per invocation. Tracer sends traces to X-Ray. Metrics publishes CloudWatch metrics. Do not log, trace or publish metrics any other way.

## Extending the system

Common changes are additive and touch a small, predictable set of places. A change that edits many files or reaches across layers is a signal to stop and check it against the rules.

- **New variant** - a schema, a union member, an adapter with its capabilities, a registry entry and tests. Handlers, core and infrastructure stay unchanged.
- **New integration** - a new adapter implementing the interface, plus registry entries.
- **New route** - a route entry in the stack and a thin handler.
- **Shared code** - an existing package where it fits. Create a package only for a distinct responsibility.

## Anti-patterns

Each row names the check that catches the anti-pattern. A row marked review has no check yet, so a reviewer must catch it. Replace review with a check wherever one is possible.

| Anti-pattern                                                                                  | Caught by                                                                                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A second application stack definition, or infrastructure split per feature or per environment | Review                                                                                                                           |
| Business logic, integration branching or lifecycle handling in a handler                      | Partly by Biome, which stops a handler importing the core, the gate, the store or an AWS SDK. Logic written inline needs review. |
| A layer calling upward or skipping the layer below                                            | Biome layer import rules                                                                                                         |
| State changed anywhere but through the gate and the core                                      | Biome layer import rules. Only the gate may import the core and the store.                                                       |
| The core calling the store or performing any other I/O                                        | Biome core rules                                                                                                                 |
| Integration name checks outside the adapter package                                           | Review                                                                                                                           |
| Hand-written types or hand-edited OpenAPI that duplicate a schema                             | Review                                                                                                                           |
| A widened union or default case that hides a missing registry entry                           | Partly by the type check, which fails on a missing registry entry. A widened union or default case needs review.                 |
| Bespoke retry, reconciliation or shadow-state infrastructure                                  | Review                                                                                                                           |
| A new async mechanism added as if it were routine                                             | Review                                                                                                                           |
| A dependency added to save a few lines of internal code                                       | Review                                                                                                                           |
| A name in DOMAIN.md that the core does not declare, or the reverse                            | Fitness functions: domain drift                                                                                                  |
| An invariant without a property test                                                          | Fitness functions: invariant coverage                                                                                            |
| Core tests that still pass when the core's behaviour changes                                  | Mutation tests                                                                                                                   |
| An `AssertionError` caught so the code can carry on                                           | Review                                                                                                                           |
