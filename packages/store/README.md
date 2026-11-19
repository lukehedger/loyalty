# Store

Persistence for domain state. Each mode has an interface, a DynamoDB single-table implementation and an in-memory implementation for tests. The store knows nothing of the core. It stores the values it is given and parses what it reads with the function it is given. Only the gate calls it.

Every write is conditional. A write that loses a race returns `{ outcome: 'conflict' }` instead of overwriting. Any other failure is thrown.

## Modes

A project uses one mode. Delete the other mode's files and their exports in `index.ts` and `tests/`.

| Mode           | Files                                                             |
| -------------- | ----------------------------------------------------------------- |
| Event-sourcing | `event-sourcing.ts`, `event-sourcing-dynamodb.ts` and their tests |
| CRUD           | `crud.ts`, `crud-dynamodb.ts` and their tests                     |

## Key layout

| Mode           | PK            | SK                                    |
| -------------- | ------------- | ------------------------------------- |
| Event-sourcing | `<ENTITY>#id` | `EVENT#<sequence>`, zero-padded to 12 |
| CRUD           | `<ENTITY>#id` | `RECORD`                              |

An event row holds `sequence`, `recordedAt`, `idempotencyKey` and `event`. A record row holds `status`, `version`, `updatedAt` and `value`. The status sits beside the value so the write condition can read it.

## Public API

Event-sourcing:

- `EventLog<Event>` - `read(streamId)` returns the stream and its version. `append(streamId, { expectedVersion, idempotencyKey, events })` appends only when the stream is still at `expectedVersion`.
- `createDynamoDbEventLog(deps)` - appends one event with a conditional put and several with one transaction of up to 100 events.
- `createInMemoryEventLog(deps)` - the same contract in memory.
- `EventStream`, `StoredEvent`, `Append`, `AppendResult`, `EventLogClient` - the types around them.

- `createDocumentClient()` - the DynamoDB document client both modes take. Create it once per container.

CRUD:

- `RecordStore<Value>` - `read(id)` returns the record and its version. `write(id, value, expected)` writes only when the record still has the expected status and version. An `expected` of `undefined` creates the record and fails if it exists.
- `createDynamoDbRecordStore(deps)` - a conditional put on the status and version.
- `createInMemoryRecordStore(deps)` - the same contract in memory.
- `StoredRecord`, `ExpectedRecord`, `WriteResult`, `StatusRecord`, `RecordStoreClient` - the types around them.

## Example

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoDbEventLog } from '@loyalty/store';

const eventLog = createDynamoDbEventLog({
  client: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  tableName: 'state-table',
  entity: 'ORDER',
  clock: () => new Date(),
  parseEvent: (value) => orderEventSchema.parse(value),
});

const { version } = await eventLog.read('order-1');
const result = await eventLog.append('order-1', {
  expectedVersion: version,
  idempotencyKey: 'request-1',
  events: [{ type: 'order_placed' }],
});
```
