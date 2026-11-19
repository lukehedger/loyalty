// biome-ignore-all assist/source/organizeImports: sorting would move exports across the mode markers.
// if: event-sourcing
export type {
  AccountApply,
  AccountCommand,
  AccountGate,
  AccountGateDeps,
  AccountRecorded,
  DynamoDbAccountGateDeps,
} from './account.ts';
export {
  createAccountGate,
  createDynamoDbAccountGate,
  parseAccountEvent,
} from './account.ts';
export type {
  Decision,
  EventSourcedCommand,
  EventSourcedGate,
  EventSourcedGateDeps,
  EventSourcedResult,
} from './event-sourcing.ts';
export { createEventSourcedGate } from './event-sourcing.ts';
// if: crud
export type {
  RecordCommand,
  RecordGate,
  RecordGateDeps,
  RecordResult,
  Transition,
} from './crud.ts';
export { createRecordGate } from './crud.ts';
// end
