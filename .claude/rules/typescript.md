---
paths:
  - "**/*.ts"
---

# TypeScript

`tsconfig.json` and `biome.json` already enforce strict mode, unchecked index access, `unknown` over `any`, `type` over `interface`, `import type`, `const` over `var`, named exports, kebab-case file names and bans on `!` and `@ts-ignore`. Fix what they report. Never disable a rule inline or in config to get a change through.

The rules below need judgement.

## Model the domain in types

**[SHOULD]** Name types, functions and fields in the ubiquitous language of `DOMAIN.md`. A concept has one name everywhere.

**[MUST]** Keep core logic pure. A decision takes state and input and returns a result, with no I/O inside.

## Negative space

State what must never happen, so a broken state fails to compile or fails loudly. Push each guarantee into the types where you can. Assert what the types cannot rule out.

**[SHOULD]** Make illegal states unrepresentable. Use a discriminated union, not optional fields that allow contradictory combinations.

```ts
type Order =
  | { readonly status: 'pending'; readonly lines: readonly Line[] }
  | { readonly status: 'shipped'; readonly lines: readonly Line[]; readonly shipment: Shipment };
```

**[MUST]** Make every branch over a union exhaustive, so a new member fails to compile. Key a registry by the union with a `Record`. End a `switch` with a default case that proves nothing is left. This is the one default case allowed. In the core and the gate, call `unreachable` from the core. Elsewhere, write `const unhandled: never = value` before you throw.

```ts
switch (order.status) {
  case 'pending': return ship(order);
  case 'shipped': return order;
  default: return unreachable(order, 'Unhandled order status');
}
```

**[SHOULD]** Brand identifiers and checked values, so one kind of value cannot pass for another and an unchecked value cannot pass for a checked one. Give each brand one constructor: a Zod schema with `.brand()` or a parse function. Never cast to a brand with `as` anywhere else.

```ts
const orderIdSchema = z.string().uuid().brand<'OrderId'>();
type OrderId = z.infer<typeof orderIdSchema>;

type PositiveAmount = number & { readonly __brand: 'PositiveAmount' };
const parseAmount = (value: number): PositiveAmount | undefined =>
  value > 0 ? (value as PositiveAmount) : undefined;
```

**[MUST]** Parse a branded value again when you read it back from JSON or DynamoDB. Serialisation drops the brand. Arithmetic drops it too: `a - b` on two `PositiveAmount`s is a plain `number`, because the result may not be positive. Check it again.

**[SHOULD]** Return a rejection as a value, so the caller must handle it. A decision is accepted or rejected. A rejection names the `InvariantName` it protects. The gate turns a rejection into a `DecisionRejectedError`.

```ts
type Decision =
  | { readonly kind: 'accepted'; readonly events: readonly [Event, ...Event[]] }
  | { readonly kind: 'rejected'; readonly invariant: InvariantName };
```

**[SHOULD]** Use a non-empty tuple, `readonly [T, ...T[]]`, where an empty list is illegal.

**[SHOULD]** Check a registry or config literal with `satisfies`. It checks the shape without widening the literal types.

**[MUST]** Assert what the types cannot rule out. In the core, call `assert` at the start and end of a decision: `assert(next.balance >= 0, 'Balance is negative after the command')`. `ARCHITECTURE.md` defines what happens when an assertion fails.

## Types

**[MUST]** Give every exported function explicit parameter and return types. Let inference type local values.

**[SHOULD]** Mark properties `readonly` and array parameters `readonly T[]`.

**[MUST]** Use `undefined` for a missing value, never `null`.

**[MUST]** Derive a type from its schema (`z.infer`) or from a central type with `Pick`, `Omit` or `Partial`. Never duplicate a shape by hand.

**[MUST]** Parse external data with a Zod schema. Never use `as` to claim a shape you have not checked.

**[MUST]** Give a generic a type parameter only when the signature uses it.

**[SHOULD]** Type ignored callback returns as `void`. Do not mark a callback parameter optional when it is always passed.

**[SHOULD]** Prefer a union or optional parameters over overloads. Where overloads are needed, put the most specific first.

## Functions over classes

**[SHOULD]** Model behaviour as plain functions over plain data. Where behaviour must vary, return an object of functions from a factory.

Use `class` only for errors (`instanceof` needs the prototype chain), CDK constructs and stacks or a mirror of the shape of a vendor SDK.

**[SHOULD]** Inject dependencies as a `deps` argument typed with the narrowest shape you use. Inject the clock too, so time-dependent logic is testable.

```ts
type Deps = { readonly store: OrderStore; readonly clock: () => Date };

const expireOrder = async (deps: Deps, id: OrderId): Promise<void> => {
  const order = await deps.store.read(id);
  if (order && order.expiresAt < deps.clock()) await deps.store.append(id, { type: 'order_expired' });
};
```

## Immutability

**[SHOULD]** Treat a `let` as a signal to restructure. Use an expression, a `reduce` or an extracted function that returns the value. Build new values. Never mutate inputs. Mutated module-level state leaks between invocations in a warm Lambda.

**[MUST]** Default with `??`. `||` replaces every falsy value, so a real `0`, `''` or `false` becomes the fallback with no error. Before you change an existing `||`, check that no falsy value relies on it.

## Async

**[SHOULD]** Recover with `.catch()` on the one call that can fail, not a `try` block wrapped around it. Keep `try`/`catch` for `finally` cleanup, synchronous throws or one recovery shared by several calls.

**[MUST]** Type a caught value as `unknown` and narrow it before use. Re-throw what you cannot handle.

```ts
const contract = await readContract(id).catch((error: unknown) => {
  if (error instanceof ContractNotFoundError) return undefined;
  throw error;
});
```

**[SHOULD]** Use `Promise.allSettled` for independent concurrent work and decide what a partial failure means. `Promise.all` discards completed results on the first rejection. Use it only for all-or-nothing work.

## Naming

**[MUST]** Use PascalCase for types and classes, camelCase for functions and variables and UPPER_SNAKE_CASE for constants. Name factories `createX` or `makeX`. Do not prefix types with `I`.

**[MUST]** Name a function for its outcome in domain terms: `rejectExpiredOrder`, not `handle` or `procOrd`. Predicates read as assertions: `isRefundable`, `canCapture`. A name that needs "and" means the function does two things. Split it.

## Lambda

**[MUST]** Type handler events and results with `@types/aws-lambda`. Export `makeHandler(deps)` and parse the event against its schema before anything else.

## Tests

**[MUST]** Write typed tests with `bun:test`. Use inline fakes passed through `deps`, not module mocks.
