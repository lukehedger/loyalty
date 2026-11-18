# @loyalty/router

Resolves the adapter for a variant, builds its context once per request and invokes the requested capability. It calls the adapters and nothing below them.

## Public API

- `registry` - the adapter for every `Variant` from `@loyalty/schema`. It is a `Record` over the union, so a new variant without an entry fails to compile. Add one entry per variant. Never widen the union or add a default entry.
- `createAccountRouter({ tableName, config, clock })` - the router over `registry`, with the context deps built once. A handler cannot reach the adapters, so it composes its router through this. Call it once per container.
- `CapabilityRouter<Capability>` - the narrowest router a handler needs, so a handler test fakes one capability.
- `createRouter({ registry, contextDeps })` - returns a `Router`. `contextDeps` is what every adapter's `buildContext` receives.
- `Router.invoke(variant, capability, ...args)` - resolves the adapter, raises `CapabilityNotSupportedError` (422) when it lacks the capability, otherwise builds the context and returns the capability's result.
- `Registry`, `RouterDeps` and `Router` - the types of the values above, generic so tests can route their own variants and capabilities.

## Example

```ts
import { createRouter, registry } from '@loyalty/router';

const router = createRouter({ registry, contextDeps });

const order = await router.invoke(request.variant, 'create', request);
```
