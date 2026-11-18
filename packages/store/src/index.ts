// biome-ignore-all assist/source/organizeImports: sorting would move exports across the mode markers.
// if: event-sourcing
export type {
  Append,
  AppendResult,
  EventLog,
  EventStream,
  InMemoryEventLogDeps,
  StoredEvent,
} from './event-sourcing.ts';
export { createInMemoryEventLog } from './event-sourcing.ts';
export type {
  DynamoDbEventLogDeps,
  EventLogClient,
} from './event-sourcing-dynamodb.ts';
export { createDynamoDbEventLog } from './event-sourcing-dynamodb.ts';
// if: crud
export type {
  ExpectedRecord,
  InMemoryRecordStoreDeps,
  RecordStore,
  StatusRecord,
  StoredRecord,
  WriteResult,
} from './crud.ts';
export { createInMemoryRecordStore } from './crud.ts';
export type {
  DynamoDbRecordStoreDeps,
  RecordStoreClient,
} from './crud-dynamodb.ts';
export { createDynamoDbRecordStore } from './crud-dynamodb.ts';
// end
