# Gate

The only path for a state change. The gate loads the current state from the store, passes the state and the command to the core's pure decision function and persists an approved decision with a conditional write. It returns a rejection unchanged and does no I/O between the read and the write.

The gate is generic over the core's State, Command, Event and Rejection types. It takes the core's functions as arguments, so the core needs no knowledge of the gate. The core returns a value of the shape below and declares that shape itself, because it imports no other package.

Each call returns one of these outcomes. Nothing is thrown except store failures.

- `approved` - the decision is persisted. Carries the new state.
- `rejected` - the core refused the command. Carries the core's rejection as it was returned.
- `conflict` - another write landed between the read and the write, so nothing was persisted. The caller may retry, which decides again on fresh state.
- `replayed` (event-sourcing only) - the stream already holds the idempotency key, so nothing was appended. Carries the current state.

## Modes

A project uses one mode. Delete the other mode's file, its exports in `index.ts` and its test.

| Mode           | Files                                                  |
| -------------- | ------------------------------------------------------ |
| Event-sourcing | `event-sourcing.ts` and `tests/event-sourcing.test.ts` |
| CRUD           | `crud.ts` and `tests/crud.test.ts`                     |

## Public API

Event-sourcing:

- `createEventSourcedGate({ eventLog, initialState, decide, evolve })` - returns `apply({ streamId, command, idempotencyKey })` and `load(streamId)`. State is the replay of every event through `evolve` from `initialState`. `load` returns `undefined` for an empty stream.
- `Decision<Event, Rejection>` - what `decide` returns: `{ outcome: 'approved', events }` or `{ outcome: 'rejected', rejection }`.
- `EventSourcedCommand`, `EventSourcedResult`, `EventSourcedGate`, `EventSourcedGateDeps` - the types around them.

Account:

- `createAccountGate({ eventLog })` - binds the core's `decide`, `evolve` and `initialState` to the event-sourced gate. `apply({ memberId, command })` takes a command of plain values and parses each one into its core brand. A value outside its brand throws `ValidationError`. The gate keys an earn as `ORDER#{orderId}` and a spend as `SPEND#{spendId}`. It resolves to `{ outcome: 'approved' | 'replayed', account }`. It throws a rejection as `DecisionRejectedError` with the invariant as its code and a conflict as `ConflictError`. `load(memberId)` returns the account or `undefined`.
- `createDynamoDbAccountGate({ tableName, clock })` - the account gate over the DynamoDB event log. The log parses every event it reads with `parseAccountEvent`.
- `parseAccountEvent(value)` - parses a stored event back into the core's branded `Event`. An unknown or out-of-brand event throws.
- `AccountGate`, `AccountApply`, `AccountCommand`, `AccountRecorded`, `AccountGateDeps` and `DynamoDbAccountGateDeps` - the types around them.

CRUD:

- `createRecordGate({ recordStore, decide })` - returns `apply({ id, command })` and `load(id)`. `decide` receives `undefined` when no record exists. The write is conditional on the status and version that were read.
- `Transition<State, Rejection>` - what `decide` returns: `{ outcome: 'approved', state }` or `{ outcome: 'rejected', rejection }`.
- `RecordCommand`, `RecordResult`, `RecordGate`, `RecordGateDeps` - the types around them.

## Example

```ts
import { decide, evolve, initialState } from '@loyalty/core';
import { createEventSourcedGate } from '@loyalty/gate';

const gate = createEventSourcedGate({ eventLog, initialState, decide, evolve });

const result = await gate.apply({
  streamId: 'order-1',
  command: { type: 'place_order' },
  idempotencyKey: request.idempotencyKey,
});
if (result.outcome === 'rejected') return toProblem(result.rejection);
```
