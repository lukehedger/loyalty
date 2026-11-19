# @loyalty/adapters

The adapter interface and, as they are added, one adapter per external integration. All behaviour specific to an integration lives here. An adapter translates a request into a command and passes it to the gate.

An adapter declares a `buildContext` and the capabilities it offers. The router calls `buildContext` once per request, then calls the requested capability with that context. A capability the adapter leaves out is a 422, never a throwing stub.

## Public API

- `CapabilitySignatures` - one entry per capability: the arguments it takes after the context and what it resolves to. The capabilities are `openAccount`, `earnPoints`, `spendPoints` and `readBalance`. A write resolves to a `RecordedBalance`, which says whether the gate approved or replayed it.
- `ContextDeps` - what the router passes to every `buildContext`: the account gate, the config reader and the clock.
- `createContextDeps({ tableName, config, clock })` - builds the `ContextDeps` over DynamoDB. Call it once per container.
- `direct` - the adapter for requests made straight to Loyalty's API. It takes the time from the clock and the earn rate from the `earn-rate` profile. It reads the earn rate on each earn only, so a spend or a balance read never waits on AppConfig.
- `Adapter<TContext>` - `buildContext(deps)` plus the opt-in `capabilities`.
- `Capabilities<TContext>` and `Capability<TContext, TSignature>` - the capability map and one capability function.
- `CapabilitySignature` and `SignatureMap` - the constraints the router and tests build on.

`Adapter` and `Capabilities` take the signatures and dependencies as optional type parameters, so tests can define their own without touching the real ones.

## Example

```ts
// index.ts
export type CapabilitySignatures = {
  readonly create: {
    readonly args: readonly [request: CreateOrderRequest];
    readonly result: CreateOrderResponse;
  };
};

// acme.ts
type AcmeContext = { readonly client: AcmeClient };

export const acme: Adapter<AcmeContext> = {
  buildContext: async (deps) => ({ client: makeAcmeClient(deps.config) }),
  capabilities: {
    create: async (context, request) =>
      translateOrder(await context.client.create(request)),
  },
};
```
